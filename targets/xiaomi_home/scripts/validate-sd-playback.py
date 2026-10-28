"""Bounded SD read/export validation using registered owner sources only."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import subprocess
import time
from urllib.parse import urlsplit, urlunsplit, parse_qs, urlencode
from urllib.request import Request, urlopen
import uuid

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:19843'

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def api(path, params, method='GET'):
    with urlopen(Request(BASE + path + '?' + urlencode(params), method=method), timeout=40) as r:
        data = r.read()
        return json.loads(data) if data else None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--camera', default='outdoor_pro_poste')
    parser.add_argument('--channel', type=int, default=0)
    args = parser.parse_args()
    cameras = read(ROOT/'runtime/central/cameras.json')
    selected = next(c for c in cameras if c['id'] == args.camera)
    normalized = lambda s: ''.join(c.lower() for c in s if c.isalnum())
    sources = read(ROOT/'evidence/private/camera-sources-cn.json')['sources']
    source = next(s['url'] for s in sources if normalized(s['name']) == normalized(selected['name']))
    u = urlsplit(source); q = {k:v[0] for k,v in parse_qs(u.query).items()}
    model = q['model']
    if model not in ['xiaomi.camera.cw701','mxiang.camera.mod11','isa.camera.hlc7']:
        raise ValueError('unsupported model')
    if args.channel not in ([0,10] if model=='xiaomi.camera.cw701' else [0]):
        raise ValueError('unsupported channel')
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    folder = ROOT/'evidence/private'/('sd-validation-'+stamp+'-'+uuid.uuid4().hex[:8])
    folder.mkdir()
    receipt = {'camera':args.camera,'channel':args.channel,'observedAt':stamp,'cardWrites':False,'pass':False}
    alias = 'qa_sd_'+uuid.uuid4().hex
    registered = False
    try:
        receipt['stage']='catalog'
        catalog = api('/api/xiaomi/storage', {'did':q['did'],'model':model,'host':u.hostname,'user':u.username,'region':'cn','catalog':'1','channel':str(args.channel)})
        (folder/'catalog.json').write_text(json.dumps(catalog),encoding='utf-8')
        entries = catalog.get('catalogItems') or []
        valid = [x for x in entries if isinstance(x,dict) and isinstance(x.get('startTime'),int) and isinstance(x.get('endTime'),int) and 1577836800 < x['startTime'] < time.time()-600 and 0 < x['endTime']-x['startTime'] <= 255]
        receipt['catalogEntries']=len(entries)
        receipt['validPastEntries']=len(valid)
        if not valid: raise ValueError('no usable past recording')
        valid.sort(key=lambda x:x['startTime'])
        chosen = valid[max(0,len(valid)-180)]
        receipt['requestedRecordingStart']=chosen['startTime']
        q.update(playback=str(chosen['startTime']),channel=str(args.channel),offset='0',speed='1',audio='0')
        playback = urlunsplit((u.scheme,u.netloc,u.path,urlencode(q),''))
        receipt['stage']='register-private-playback-source'
        api('/api/streams',{'name':alias,'src':playback},'PUT'); registered=True
        ffmpeg = Path(read(ROOT/'runtime/central/tool-paths.json')['ffmpeg'])
        ffprobe = ffmpeg.with_name('ffprobe.exe' if ffmpeg.suffix=='.exe' else 'ffprobe')
        clip = folder/'sd-clip.mp4'
        receipt['stage']='receive-five-second-video'
        with (folder/'ffmpeg.log').open('wb') as log:
            result = subprocess.run([str(ffmpeg),'-hide_banner','-nostdin','-v','error','-rw_timeout','25000000','-i',BASE+'/api/stream.mp4?'+urlencode({'src':alias,'video':'h265'}),'-t','5','-map','0:v:0','-an','-c:v','copy',str(clip)],stdout=log,stderr=log,timeout=45)
        receipt['ffmpegExit']=result.returncode
        if result.returncode or not clip.exists(): raise ValueError('video export failed')
        media = subprocess.run([str(ffprobe),'-v','error','-show_streams','-show_format','-of','json',str(clip)],capture_output=True,timeout=10)
        metadata=json.loads(media.stdout)
        (folder/'media.json').write_text(json.dumps(metadata),encoding='utf-8')
        video=next(s for s in metadata['streams'] if s['codec_type']=='video')
        receipt.update(codec=video['codec_name'],width=video['width'],height=video['height'],duration=float(metadata['format']['duration']),sha256=hashlib.sha256(clip.read_bytes()).hexdigest())
        with (folder/'decode.log').open('wb') as log:
            decoded=subprocess.run([str(ffmpeg),'-hide_banner','-nostdin','-v','error','-i',str(clip),'-frames:v','1','-q:v','2',str(folder/'first-frame.jpg')],stdout=log,stderr=log,timeout=15)
        receipt['decodeExit']=decoded.returncode
        receipt['pass']=decoded.returncode==0 and receipt['duration']>=3
        receipt['stage']='decoded-recording-awaiting-visual-time-verification'
    except Exception as error:
        receipt['errorType']=type(error).__name__
        (folder/'error.txt').write_text(str(error),encoding='utf-8')
    finally:
        if registered:
            try: api('/api/streams',{'src':alias},'DELETE'); receipt['temporarySourceRemoved']=True
            except Exception: receipt['temporarySourceRemoved']=False
        (folder/'receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
        print(json.dumps({'receipt':receipt,'privateEvidenceDirectory':str(folder)}))

if __name__=='__main__': main()
