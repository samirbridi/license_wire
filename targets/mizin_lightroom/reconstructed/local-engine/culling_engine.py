"""Independent offline culling suggestions. No file deletion, edits or catalog writes.

Grouping is conservative visual/time matching, not person identification. RAW
exposure and focus metrics indicate review risks, not guaranteed recoverability.
"""
from __future__ import annotations
import csv
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import hashlib
import io
import json
import math
import os
from pathlib import Path
import threading

import numpy as np
from PIL import Image,ImageOps
from raw_features import sha256_file,source_reader

ALGORITHM='MIZIN_LOCAL_CULL_V1'
MAX_PHOTOS=2000
RAW_EXTENSIONS={'.cr3','.cr2','.nef','.arw','.dng','.raf','.orf','.rw2','.pef','.srw'}
RASTER_EXTENSIONS={'.jpg','.jpeg','.tif','.tiff','.png'}


def cv_module():
    import cv2
    cv2.setNumThreads(2)
    return cv2


def sensor_statistics(raw):
    """Odd-stride sampling retains every CFA phase; never uses the JPEG histogram."""
    image=raw.raw_image_visible
    if image.ndim!=2: return {'available':False,'reason':'NON_MOSAIC_SENSOR'}
    sample=np.asarray(image[::3,::3],dtype=np.float32)
    colors=np.asarray(raw.raw_colors_visible[::3,::3],dtype=np.intp)
    black=np.array(raw.black_level_per_channel,dtype=np.float32)
    white=np.array(raw.camera_white_level_per_channel or [raw.white_level]*len(black),dtype=np.float32)
    white=np.where(white>black+1,white,float(raw.white_level))
    if colors.max()>=len(black) or (white<=black+1).any():return {'available':False,'reason':'INVALID_SENSOR_LEVELS'}
    signal=(sample-black[colors])/(white[colors]-black[colors])
    per=[]
    for color in sorted(np.unique(colors)):
        values=signal[colors==color]
        per.append({'cfaIndex':int(color),'nearBlackFraction':float((values<=.0008).mean()),
                    'saturatedFraction':float((values>=.995).mean())})
    return {'available':True,'sampleCount':int(sample.size),'sampleStride':3,
            'nearBlackFraction':float((signal<=.0008).mean()),'saturatedFraction':float((signal>=.995).mean()),
            'perCfaChannel':per,'blackLevels':black.tolist(),'whiteLevels':white.tolist()}


# LibRaw flip code -> PIL transpose that turns the sensor-oriented embedded JPEG upright,
# matching what raw.postprocess() returns for the same file.
EMBEDDED_FLIP={3:Image.Transpose.ROTATE_180,5:Image.Transpose.ROTATE_90,6:Image.Transpose.ROTATE_270}
PREVIEW_SOURCES=('raw','embedded')


def embedded_preview(raw):
    """The camera's own full-size JPEG inside the RAW (Neurapix: 'Embedded thumbnails').

    ~5 ms instead of ~0.5 s of demosaicing. None when the RAW has no usable JPEG preview, so
    the caller falls back to the RAW render."""
    import rawpy
    try:
        thumb=raw.extract_thumb()
    except Exception:
        return None
    if thumb.format!=rawpy.ThumbFormat.JPEG:return None
    with Image.open(io.BytesIO(thumb.data)) as original:
        original.draft('RGB',(1600,1600))  # DCT-domain downscale: decodes only what is needed
        image=original.convert('RGB')
    if raw.sizes.flip in EMBEDDED_FLIP:image=image.transpose(EMBEDDED_FLIP[raw.sizes.flip])
    image.thumbnail((1600,1600),Image.Resampling.LANCZOS)
    if min(image.size)<400:return None  # a tiny thumbnail cannot judge focus
    return np.array(image)


def load_image(path,preview='raw'):
    """RAW linear RGB for exposure, independent technical display for focus/grouping.

    preview='embedded' takes display/linear from the camera JPEG inside the RAW; the exposure
    risk still reads the sensor itself (sensor_statistics), never the JPEG histogram."""
    cv=cv_module()
    if path.suffix.lower() in RAW_EXTENSIONS:
        import rawpy
        with rawpy.imread(str(path)) as raw:
            sensor=sensor_statistics(raw)
            if preview=='embedded':
                display=embedded_preview(raw)
                if display is not None:
                    linear=(display.astype(np.float32)/255)**2.2
                    return display,linear,{**sensor,'previewSource':'EMBEDDED_JPEG'}
            rgb=raw.postprocess(half_size=True,use_camera_wb=True,use_auto_wb=False,no_auto_bright=True,
                output_color=rawpy.ColorSpace.sRGB,output_bps=16,gamma=(1,1),bright=1.0,exp_shift=1.0,
                demosaic_algorithm=rawpy.DemosaicAlgorithm.LINEAR)
        linear=rgb.astype(np.float32)/65535
        height,width=linear.shape[:2]
        if max(height,width)>1600:
            ratio=1600/max(height,width);linear=cv.resize(linear,(round(width*ratio),round(height*ratio)),interpolation=cv.INTER_AREA)
        display=np.rint(np.power(np.clip(linear,0,1),1/2.2)*255).astype(np.uint8)
        return display,linear,sensor
    if path.suffix.lower() not in RASTER_EXTENSIONS:raise ValueError('Formato fora da selecao local desta versao')
    with Image.open(path) as original:
        original.load();image=ImageOps.exif_transpose(original).convert('RGB');image.thumbnail((1600,1600),Image.Resampling.LANCZOS)
        display=np.array(image)
    linear=(display.astype(np.float32)/255)**2.2
    return display,linear,{'available':False,'reason':'RASTER_HAS_NO_SENSOR_RECOVERY_DATA'}


def create_detector(bundle,info):
    cv=cv_module();asset=bundle/'PublicModels/YuNet/face_detection_yunet_2023mar.onnx'
    expected=info.get('cullingFaceModelSha256')
    if not isinstance(expected,str) or sha256_file(asset)!=expected:raise ValueError('Detector publico de rostos ausente ou diferente do pacote')
    # Buffer overload supports Unicode Windows paths without native filename decoding.
    return cv.FaceDetectorYN.create('onnx',np.frombuffer(asset.read_bytes(),dtype=np.uint8),np.empty(0,dtype=np.uint8),
                                    (640,640),.85,.3,5000)


def focus_metric(gray):
    cv=cv_module()
    if gray.size<32*32 or min(gray.shape)<24:return {'score':None,'texture':0.0}
    # Reduce sensor noise before scoring high frequencies. Flat surfaces stay uncertain.
    smooth=cv.GaussianBlur(gray.astype(np.float32)/255,(3,3),.65)
    gx=cv.Sobel(smooth,cv.CV_32F,1,0,ksize=3);gy=cv.Sobel(smooth,cv.CV_32F,0,1,ksize=3)
    energy=gx*gx+gy*gy;texture=float(np.mean(energy))
    lap=cv.Laplacian(smooth,cv.CV_32F,ksize=1)
    # Relative edge detail reduces dependence on brightness/contrast.
    score=float(np.mean(lap*lap)/(texture+.00001))
    return {'score':round(score,6),'texture':round(texture,6)}


def image_features(display,linear,sensor,detector,meta):
    cv=cv_module();height,width=display.shape[:2]
    detector_scale=min(1,960/max(height,width));detector_image=cv.resize(display,(round(width*detector_scale),round(height*detector_scale)))
    detector.setInputSize((detector_image.shape[1],detector_image.shape[0]))
    _,found=detector.detect(cv.cvtColor(detector_image,cv.COLOR_RGB2BGR))
    faces=[];gray=cv.cvtColor(display,cv.COLOR_RGB2GRAY)
    for face in ([] if found is None else found):
        x,y,w,h=(float(v)/detector_scale for v in face[:4]);x0=max(0,round(x));y0=max(0,round(y));x1=min(width,round(x+w));y1=min(height,round(y+h))
        if x1<=x0 or y1<=y0:continue
        # Standardize face scale where enough detail is available; tiny faces are unknown.
        region=gray[y0:y1,x0:x1]
        focus=focus_metric(cv.resize(region,(128,128),interpolation=cv.INTER_AREA)) if min(region.shape)>=48 else {'score':None,'texture':0.0}
        color=cv.resize(display[y0:y1,x0:x1],(8,8),interpolation=cv.INTER_AREA).astype(np.float32)/255
        faces.append({'box':[x0/width,y0/height,(x1-x0)/width,(y1-y0)/height],'confidence':float(face[-1]),
                      'focus':focus,'appearance':color.mean(axis=(0,1)).tolist()})
    patches=[]
    for iy in range(3):
        for ix in range(3):
            patch=gray[iy*height//3:(iy+1)*height//3,ix*width//3:(ix+1)*width//3]
            patches.append(focus_metric(patch))
    textured=[p['score'] for p in patches if p['score'] is not None and p['texture']>.001]
    face_scores=[f['focus']['score'] for f in faces if f['focus']['score'] is not None and f['focus']['texture']>.001]
    # In groups, protect the least clear evaluable faces rather than the sharp background.
    score=float(np.quantile(face_scores,.1)) if face_scores else float(np.quantile(textured,.8)) if textured else None
    reasons=[]
    if score is None:reasons.append('LOW_TEXTURE_OR_SMALL_SUBJECT')
    elif score<.008:reasons.append('POSSIBLE_DEFOCUS_OR_MOTION')
    if faces and len(face_scores)<len(faces):reasons.append('SOME_FACES_TOO_SMALL_TO_EVALUATE')
    luma=linear@np.array([.2126,.7152,.0722],dtype=np.float32)
    p95=float(np.quantile(luma,.95));p99=float(np.quantile(luma,.99))
    face_p95=[float(np.quantile(luma[round(f['box'][1]*height):max(round((f['box'][1]+f['box'][3])*height),round(f['box'][1]*height)+1),
        round(f['box'][0]*width):max(round((f['box'][0]+f['box'][2])*width),round(f['box'][0]*width)+1)],.95)) for f in faces]
    if sensor.get('available'):
        if sensor['nearBlackFraction']>=.985 and p99<.005:reasons.append('RAW_SIGNAL_NEAR_BLACK_FLOOR')
        elif p95<.02 and (not face_p95 or max(face_p95)<.03):reasons.append('DARK_IMAGE_RECOVERY_REVIEW')
        if sensor['saturatedFraction']>=.90 and min(c['saturatedFraction'] for c in sensor['perCfaChannel'])>=.70:
            reasons.append('RAW_HIGHLIGHTS_WIDELY_CLIPPED')
    else:
        if p95<.02:reasons.append('DARK_RASTER_ORIGINAL_RAW_NEEDED')
        if float((gray>=253).mean())>.90:reasons.append('BRIGHT_RASTER_ORIGINAL_RAW_NEEDED')
    tiny=cv.resize(gray,(33,32),interpolation=cv.INTER_AREA)
    bits=np.packbits(tiny[:,1:]>tiny[:,:-1]).tobytes()
    hist=cv.calcHist([cv.cvtColor(display,cv.COLOR_RGB2HSV)],[0,1],None,[12,4],[0,180,0,256]).flatten()
    hist=hist/max(float(hist.sum()),1)
    orb=cv.ORB_create(nfeatures=400);points,descriptors=orb.detectAndCompute(gray,None)
    coordinates=np.array([p.pt for p in points],dtype=np.float32)
    subject_points=None;subject_descriptors=None;subject_boxes=[];subject_hash=None
    coverage=None
    if faces:
        x0=min(f['box'][0] for f in faces);y0=min(f['box'][1] for f in faces)
        x1=max(f['box'][0]+f['box'][2] for f in faces);y1=max(f['box'][1]+f['box'][3] for f in faces)
        coverage=(x1-x0)*(y1-y0)
        # Normalize the group's scale before matching open/close compositions.
        # Match support must span most face/upper-body regions, so a common birthday person alone
        # cannot collapse otherwise different groups against the same backdrop.
        face_height=float(np.median([f['box'][3] for f in faces]))
        left=max(0,int((x0-.03)*width));top=max(0,int((y0-.03)*height))
        right=min(width,int((x1+.03)*width));bottom=min(height,int((y1+2*face_height)*height))
        subject=gray[top:bottom,left:right]
        scale=min(2.5,1024/max(subject.shape))
        subject=cv.resize(subject,(max(1,round(subject.shape[1]*scale)),max(1,round(subject.shape[0]*scale))),interpolation=cv.INTER_AREA)
        mask=np.zeros(subject.shape,np.uint8)
        for face in faces:
            fx,fy,fw,fh=face['box'];box=[(fx*width-left)*scale,(fy*height-top)*scale,fw*width*scale,fh*height*scale]
            subject_boxes.append(box)
            bx,by,bw,bh=box
            cv.rectangle(mask,(max(0,int(bx-.25*bw)),max(0,int(by-.2*bh))),
                         (min(mask.shape[1]-1,int(bx+1.25*bw)),min(mask.shape[0]-1,int(by+2.5*bh))),255,-1)
        kp,subject_descriptors=orb.detectAndCompute(subject,mask)
        subject_points=np.array([p.pt for p in kp],dtype=np.float32)
        small=cv.resize(subject,(33,32),interpolation=cv.INTER_AREA)
        subject_hash=np.packbits(small[:,1:]>small[:,:-1]).tobytes()
    major={'POSSIBLE_DEFOCUS_OR_MOTION','RAW_SIGNAL_NEAR_BLACK_FLOOR','RAW_HIGHLIGHTS_WIDELY_CLIPPED'}
    quality=(score or 0)*100-len(major.intersection(reasons))*20
    return {'width':width,'height':height,'orientation':'vertical' if height>width*1.05 else 'horizontal' if width>height*1.05 else 'square',
            'faceCount':len(faces),'faceCoverage':coverage,'focusScore':score,'focusSource':'faces' if face_scores else 'textured_regions',
            'qualityScore':round(quality,4),'reviewReasons':reasons,'sensorExposure':sensor,'linearLumaP95':p95,'linearLumaP99':p99,
            'recoveryVerdict':'REVIEW_RISK_ONLY','faces':[{'box':f['box'],'focus':f['focus'],'confidence':f['confidence']} for f in faces],
            '_faceAppearance':[f['appearance'] for f in faces],'_dhash':bits,'_hist':hist,'_points':coordinates,'_descriptors':descriptors,
            '_subjectPoints':subject_points,'_subjectDescriptors':subject_descriptors,'_subjectBoxes':subject_boxes,'_subjectHash':subject_hash,
            '_pixelDigest':hashlib.sha256(cv.resize(display,(320,320),interpolation=cv.INTER_AREA).tobytes()).hexdigest()}


def capture_seconds(text):
    if not isinstance(text,str):return None,None
    try:
        value=dt.datetime.fromisoformat(text[:10].replace(':','-')+'T'+text[11:])
        # Naive clocks compare only to naive clocks, never reinterpret as UTC.
        aware=value.utcoffset() is not None
        return (value.timestamp() if aware else (value-dt.datetime(1970,1,1)).total_seconds()),aware
    except (ValueError,OverflowError):return None,None


def similarity(first,second):
    if first['sourceSha256']==second['sourceSha256']:return True,'EXACT_FILE'
    a,b=first['_vision'],second['_vision']
    # Require bounded capture time, camera and event folder for non-exact matches.
    if first['_clockType']!=second['_clockType'] or first['_time'] is None or second['_time'] is None:return False,None
    if abs(first['_time']-second['_time'])>45 or first['_scope']!=second['_scope']:return False,None
    if a['_pixelDigest']==b['_pixelDigest']:return True,'EXACT_TECHNICAL_IMAGE'
    if a['faceCount']!=b['faceCount']:return False,None
    if a['faceCount']:
        ca=sorted(a['_faceAppearance']);cb=sorted(b['_faceAppearance'])
        if max(np.linalg.norm(np.array(x)-np.array(y)) for x,y in zip(ca,cb))>.24:return False,None
    color_distance=float(np.abs(a['_hist']-b['_hist']).sum())
    if color_distance>.65:return False,None
    methods=['subject','scene'] if a['faceCount'] else ['scene']
    cv=cv_module()
    for method in methods:
        subject=method=='subject'
        da=a.get('_subjectDescriptors') if subject else a['_descriptors'];db=b.get('_subjectDescriptors') if subject else b['_descriptors']
        if da is None or db is None:continue
        pa=a['_subjectPoints'] if subject else a['_points'];pb=b['_subjectPoints'] if subject else b['_points']
        hashes=(a['_subjectHash'],b['_subjectHash']) if subject else (a['_dhash'],b['_dhash'])
        hamming=sum((x^y).bit_count() for x,y in zip(*hashes))/1024
        matches=cv.BFMatcher(cv.NORM_HAMMING).knnMatch(da,db,k=2)
        good=[pair[0] for pair in matches if len(pair)==2 and pair[0].distance<.72*pair[1].distance]
        minimum=18 if subject else 24
        if len(good)<minimum:continue
        src=np.float32([pa[m.queryIdx] for m in good]);dst=np.float32([pb[m.trainIdx] for m in good])
        cv.setRNGSeed(1729)
        transform,inliers=cv.estimateAffinePartial2D(src,dst,method=cv.RANSAC,ransacReprojThreshold=4,maxIters=1000,confidence=.99)
        if transform is None or inliers is None:continue
        ratio=float(inliers.mean());count=int(inliers.sum())
        if count<minimum or ratio<.65 or (hamming>.30 if subject else hamming>.23) and count<(35 if subject else 50):continue
        if a['faceCount']:
            boxes_a=a['_subjectBoxes'] if subject else [[f['box'][0]*a['width'],f['box'][1]*a['height'],f['box'][2]*a['width'],f['box'][3]*a['height']] for f in a['faces']]
            boxes_b=b['_subjectBoxes'] if subject else [[f['box'][0]*b['width'],f['box'][1]*b['height'],f['box'][2]*b['width'],f['box'][3]*b['height']] for f in b['faces']]
            def supported(points,boxes):
                points=points[inliers.flatten().astype(bool)]
                return sum(sum((x-.2*w<=px<=x+1.2*w and y-.2*h<=py<=y+2.5*h) for px,py in points)>=2 for x,y,w,h in boxes)
            required=math.ceil(a['faceCount']*.7)
            if min(supported(src,boxes_a),supported(dst,boxes_b))<required:continue
        return True,'SUBJECT_SCALE_FACES_GEOMETRY' if subject else 'VISUAL_TIME_GEOMETRY'
    return False,None


def assign_groups(rows,max_per_group=4):
    if type(max_per_group)!=int or not 1<=max_per_group<=4:raise ValueError('Limite deve ficar entre 1 e 4')
    valid=[r for r in rows if r['status']=='CULL_ANALYZED']
    valid.sort(key=lambda r:(r['_scope'],r['_clockType'] is True,r['_time'] if r['_time'] is not None else float('inf'),r['id']))
    groups=[];by_hash={};by_pixels={}
    for row in valid:
        match=by_hash.get(row['sourceSha256'])
        pixel_match=by_pixels.get(row['_vision']['_pixelDigest'])
        if match is None and pixel_match is not None:
            same,method=similarity(pixel_match['rows'][0],row)
            if same:match=pixel_match;row['similarityEvidence']=method
        if match is None:
            # Recent representatives only; no transitive chains across an entire event.
            for group in reversed(groups[-200:]):
                representative=group['rows'][0]
                if row['_time'] is None or representative['_time'] is None:continue
                if abs(row['_time']-representative['_time'])>120:continue
                same,method=similarity(representative,row)
                if same:
                    match=group;row['similarityEvidence']=method;break
        if match is None:
            match={'id':f'G{len(groups)+1:05}','rows':[]};groups.append(match)
        match['rows'].append(row);by_hash[row['sourceSha256']]=match;by_pixels[row['_vision']['_pixelDigest']]=match
    summaries=[]
    severe={'POSSIBLE_DEFOCUS_OR_MOTION','RAW_SIGNAL_NEAR_BLACK_FLOOR','RAW_HIGHLIGHTS_WIDELY_CLIPPED'}
    for group in groups:
        members=group['rows'];unique={}
        for r in sorted(members,key=lambda r:(-r['_vision']['qualityScore'],r['id'])):unique.setdefault(r['_vision']['_pixelDigest'],r)
        pool=list(unique.values());clear=[r for r in pool if not severe.intersection(r['_vision']['reviewReasons'])]
        candidates=clear or pool
        # Infer open/close relative to detected subject area, with focal length only as fallback.
        scales=[r['_vision']['faceCoverage'] or r.get('focalLength35') or r.get('focalLength') or 1 for r in candidates]
        spread=max(scales)/max(min(scales),.00001) if scales else 1
        lo,hi=np.quantile(scales,[.3,.7]) if scales else (0,0)
        for row in members:
            scale=row['_vision']['faceCoverage'] or row.get('focalLength35') or row.get('focalLength') or 1
            row['framing']='wide' if spread>=1.35 and scale<=lo else 'close' if spread>=1.35 and scale>=hi else 'medium'
        chosen=[];covered=set()
        while candidates and len(chosen)<max_per_group:
            def utility(row):
                tags={'orientation:'+row['_vision']['orientation'],'framing:'+row['framing']}
                return (len(tags-covered)*100+min(max(row['_vision']['qualityScore'],0),30),row['_vision']['qualityScore'],row['id'])
            best=max(candidates,key=utility);candidates.remove(best);chosen.append(best)
            covered.update({'orientation:'+best['_vision']['orientation'],'framing:'+best['framing']})
        chosen_ids={r['id'] for r in chosen}
        for row in members:
            row['groupId']=group['id'];row['suggestedKeep']=row['id'] in chosen_ids
            row['decision']='KEEP_FOR_REVIEW' if row['suggestedKeep'] else 'EXCESS_SIMILAR'
            row['groupSize']=len(members)
        summaries.append({'id':group['id'],'size':len(members),'suggestedKeepIds':sorted(chosen_ids),
                          'orientationsKept':sorted({r['_vision']['orientation'] for r in chosen}),
                          'framingKept':sorted({r['framing'] for r in chosen})})
    return summaries


METADATA_TAGS=['-Model','-BodySerialNumber','-DateTimeOriginal','-SubSecDateTimeOriginal','-FocalLength#',
               '-FocalLengthIn35mmFormat#']
METADATA_CHUNK=250


def worker_count(total):
    """Photos analysed at once. Leaves cores for Lightroom itself (i7-11800H: 16 threads -> 8)."""
    cpus=os.cpu_count() or 4
    return max(1,min(total,8,cpus-2 if cpus>4 else cpus))


def read_metadata(executable,job,paths):
    """One ExifTool process per 250 photos instead of one per photo (~1.6 s of Perl start-up
    each). Returns {normcase(abspath): tags}; a photo ExifTool could not read is simply absent
    and fails on its own, the others continue."""
    import subprocess
    found={}
    for start in range(0,len(paths),METADATA_CHUNK):
        chunk=[p for p in paths[start:start+METADATA_CHUNK] if p is not None]
        if not chunk:continue
        argument=job/f'cull-metadata-{start:04}.args'
        argument.write_text('--\n'+''.join(str(p).replace('\\','/')+'\n' for p in chunk),encoding='utf-8')
        cmd=[str(executable),'-config','','-fast2','-json','-charset','filename=UTF8',*METADATA_TAGS,'-@',str(argument)]
        result=subprocess.run(cmd,capture_output=True,encoding='utf-8',errors='strict',timeout=90+2*len(chunk),
                              creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        # ExifTool exits non-zero when ANY file failed; the JSON still has every readable one.
        try:metadata=json.loads(result.stdout) if result.stdout.strip() else []
        except json.JSONDecodeError:metadata=[]
        for meta in metadata if isinstance(metadata,list) else []:
            if isinstance(meta,dict) and isinstance(meta.get('SourceFile'),str) and not meta.get('Error'):
                found[os.path.normcase(os.path.abspath(meta['SourceFile']))]=meta
    return found


def analyze_photo(index,photo,path,meta,metadata_stat,job,bundle,info,preview_source,detectors):
    """Everything for one photo; runs on a worker thread. Same checks as the sequential engine:
    the original is locked against writes, hashed before/after and must not change since its
    metadata was read."""
    if meta is None:raise ValueError('Metadados indisponiveis')
    detector=getattr(detectors,'value',None)
    if detector is None:detector=detectors.value=create_detector(bundle,info)  # YuNet is not thread-safe
    with source_reader(path):
        source_hash=sha256_file(path)
        image,linear,sensor=load_image(path,preview_source);vision=image_features(image,linear,sensor,detector,meta)
        after=path.stat()
        if (metadata_stat.st_size,metadata_stat.st_mtime_ns)!=(after.st_size,after.st_mtime_ns) or source_hash!=sha256_file(path):
            raise ValueError('Original mudou durante a selecao')
    thumbnail=Image.fromarray(image);thumbnail.thumbnail((480,480));preview=f'cull-{index:04}.jpg';thumbnail.save(job/preview,quality=85)
    capture=meta.get('SubSecDateTimeOriginal') or meta.get('DateTimeOriginal');time,clock=capture_seconds(capture)
    return {'status':'CULL_ANALYZED','sourceSha256':source_hash,'sourceMetadataStable':True,'cameraModel':meta.get('Model'),
            'captureTimeExif':capture,'technicalPreviewRelative':preview,'previewSource':sensor.get('previewSource','RAW_RENDER'),
            'focalLength':meta.get('FocalLength'),'focalLength35':meta.get('FocalLengthIn35mmFormat'),'_time':time,'_clockType':clock,
            '_scope':(os.path.normcase(str(path.parent)),meta.get('Model') or '',meta.get('BodySerialNumber') or ''),'_vision':vision}


def run_culling(request,job,bundle,info,report,progress):
    photos=request.get('photos');options=request.get('cullingOptions',{})
    identity=request.get('catalogIdentity')
    if not isinstance(identity,str) or not 1<=len(identity)<=2000:raise ValueError('Identidade do catalogo ausente na selecao')
    if not isinstance(photos,list) or not 1<=len(photos)<=MAX_PHOTOS:raise ValueError('Selecione de 1 a 2.000 fotos')
    ids=[p.get('id') for p in photos]
    if not all(isinstance(i,str) and 0<len(i)<=128 for i in ids) or len(set(ids))!=len(ids):raise ValueError('Identificadores de fotos invalidos')
    maximum=options.get('maxPerGroup',4)
    if type(maximum)!=int or not 1<=maximum<=4:raise ValueError('Limite de repetidas deve ser de 1 a 4')
    preview_source=options.get('previewSource','raw')
    if preview_source not in PREVIEW_SOURCES:raise ValueError('Origem da previa invalida')
    create_detector(bundle,info)  # fail fast on a missing/altered model before reading any photo
    executable=bundle/'Tools/ExifTool/exiftool.exe'
    workers=worker_count(len(photos))
    report.update({'operation':'cull','algorithm':ALGORITHM,'requestedPhotos':len(photos),'catalogIdentity':request.get('catalogIdentity'),
                   'maximumPerSimilarGroup':maximum,'automaticDeletion':False,'automaticFlagChanges':False,
                   'recoveryAssessment':'RAW_SIGNAL_RISK_NOT_A_GUARANTEE','cullingQualityValidated':False,
                   'previewSource':preview_source,'parallelWorkers':workers})
    if (job/'cancel.request').exists():
        report['status']='CANCELLED'
    else:
        rows,paths,stats,early={},[],{},{}
        for i,photo in enumerate(photos):
            path=Path(photo.get('path',''));rows[i]={'id':photo['id'],'path':str(path),'filename':path.name,'status':'FAILED'}
            try:
                if not path.is_absolute() or not path.is_file() or path.suffix.lower() not in RAW_EXTENSIONS|RASTER_EXTENSIONS:
                    raise ValueError('Original indisponivel ou formato fora da selecao desta versao')
                if photo.get('isVirtualCopy') is not False:raise ValueError('Selecione originais; copias virtuais nao entram nesta triagem')
                if any(ord(c)<32 for c in str(path)):raise ValueError('Caminho com caracteres de controle')
                stats[i]=path.stat();paths.append(path)
            except Exception as error:early[i]=str(error)[:1500];paths.append(None)
        progress('CULL_METADATA',0,len(photos))
        metadata=read_metadata(executable,job,paths) if any(paths) else {}
        detectors=threading.local();done=0;cancelled=False
        with ThreadPoolExecutor(max_workers=workers,thread_name_prefix='crispix-cull') as pool:
            futures={}
            for i,photo in enumerate(photos):
                if i in early:continue
                path=paths[i];meta=metadata.get(os.path.normcase(os.path.abspath(str(path))))
                futures[i]=pool.submit(analyze_photo,i,photo,path,meta,stats[i],job,bundle,info,preview_source,detectors)
            for i,photo in enumerate(photos):
                if i in early:rows[i]['error']=early[i]
                elif cancelled or (job/'cancel.request').exists():
                    # Photos not started are dropped; one already running finishes and is kept.
                    if not cancelled:cancelled=True;report['status']='CANCELLED'
                    if futures[i].cancel():rows.pop(i);continue
                    try:rows[i].update(futures[i].result())
                    except Exception as error:rows[i]['error']=str(error)[:1500]
                else:
                    try:rows[i].update(futures[i].result())
                    except Exception as error:rows[i]['error']=str(error)[:1500]
                if i in rows:done+=1;progress('CULL_PROCESSING',done,len(photos),rows[i]['filename'])
        report['results'].extend(rows[i] for i in sorted(rows))
        if not cancelled:report['status']='COMPLETED'
    progress('CULL_GROUPING',len(report['results']),len(photos))
    try:
        report['groups']=assign_groups(report['results'],maximum)
    finally:
        # Keep error reports serializable even when matching fails mid-group.
        for row in report['results']:
            vision=row.pop('_vision',None)
            if vision:row.update({k:v for k,v in vision.items() if not k.startswith('_')})
            for key in list(row):
                if key.startswith('_'):del row[key]
    report['analyzedPhotos']=sum(r['status']=='CULL_ANALYZED' for r in report['results'])
    report['suggestedKeepPhotos']=sum(r.get('suggestedKeep',False) for r in report['results'])
    report['excessSimilarPhotos']=sum(r.get('decision')=='EXCESS_SIMILAR' for r in report['results'])
    report['qualityReviewPhotos']=sum(bool(r.get('reviewReasons')) for r in report['results'])
    if report['status']!='CANCELLED' and any(r['status']=='FAILED' for r in report['results']):report['status']='COMPLETED_WITH_ERRORS'
    with (job/'culling.csv').open('x',encoding='utf-8-sig',newline='') as stream:
        writer=csv.writer(stream,delimiter=';');writer.writerow(['foto','grupo','escolhida','orientacao','enquadramento','rostos','revisar','erro'])
        def safe(value):
            value=str(value)
            return "'"+value if value.startswith(('=','+','-','@','\t','\r')) else value
        for row in report['results']:
            writer.writerow([safe(row.get(k,'')) for k in ('filename','groupId','suggestedKeep','orientation','framing','faceCount')]+[
                ','.join(row.get('reviewReasons',[])),safe(row.get('error',''))])
    return report
