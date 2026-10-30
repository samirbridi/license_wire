import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import cv2
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'reconstructed/local-engine'))
import culling_engine as cull
import test_local_engine as fixtures


class EmptyDetector:
    def setInputSize(self,size):pass
    def detect(self,image):return 0,None


def vision(index=1,orientation='horizontal',coverage=.1,quality=10,reasons=()):
    return {'orientation':orientation,'faceCoverage':coverage,'qualityScore':quality,'reviewReasons':list(reasons),
        'faceCount':2,'_pixelDigest':str(index),'_hist':np.ones(48)/48,'_dhash':bytes(128),
        '_points':np.zeros((0,2),np.float32),'_descriptors':None,'_faceAppearance':[[.5,.5,.5],[.6,.6,.6]]}


def row(index,**kwargs):
    return {'id':str(index),'status':'CULL_ANALYZED','sourceSha256':str(index),'_time':100+index,
            '_clockType':False,'_scope':('event','camera','serial'),'_vision':vision(index,**kwargs)}


class CullingPolicyTests(unittest.TestCase):
    def test_maximum_four_preserves_both_orientations_and_open_close(self):
        rows=[row(i,orientation='horizontal' if i%2 else 'vertical',coverage=.05 if i<5 else .3,quality=10+i/10) for i in range(1,13)]
        with patch.object(cull,'similarity',return_value=(True,'OWN_FIXTURE')):groups=cull.assign_groups(rows)
        chosen=[r for r in rows if r['suggestedKeep']]
        self.assertEqual(len(chosen),4);self.assertEqual(len(groups),1)
        self.assertEqual({r['_vision']['orientation'] for r in chosen},{'horizontal','vertical'})
        self.assertEqual({r['framing'] for r in chosen},{'wide','close'})
        self.assertEqual(sum(not r['suggestedKeep'] for r in rows),8)

    def test_bad_focus_variant_does_not_displace_clear_alternatives(self):
        rows=[row(i,quality=10) for i in range(1,7)]
        rows.append(row(7,orientation='vertical',quality=-20,reasons=['POSSIBLE_DEFOCUS_OR_MOTION']))
        with patch.object(cull,'similarity',return_value=(True,'OWN_FIXTURE')):cull.assign_groups(rows)
        self.assertFalse(rows[-1]['suggestedKeep'])
        self.assertTrue(rows[-1]['_vision']['reviewReasons'])

    def test_exact_duplicates_keep_one_and_no_transitive_event_chain(self):
        rows=[row(i) for i in range(1,10)]
        for r in rows:r['sourceSha256']='same';r['_vision']['_pixelDigest']='same'
        self.assertEqual(len(cull.assign_groups(rows)[0]['suggestedKeepIds']),1)
        rows=[row(i) for i in range(1,5)]
        for i,r in enumerate(rows):r['_time']=i*40
        with patch.object(cull,'similarity',side_effect=lambda a,b:(abs(a['_time']-b['_time'])<=45,'OWN_FIXTURE')):
            groups=cull.assign_groups(rows)
        self.assertEqual([g['size'] for g in groups],[2,2])

    def test_different_clocks_folders_and_missing_time_do_not_merge(self):
        first=row(1);second=row(2)
        for kind in ['clock','folder','time']:
            a=copy.deepcopy(first);b=copy.deepcopy(second)
            if kind=='clock':b['_clockType']=True
            if kind=='folder':b['_scope']=('other','camera','serial')
            if kind=='time':b['_time']=None
            self.assertFalse(cull.similarity(a,b)[0])
        with self.assertRaises(ValueError):cull.assign_groups([first],5)

    def test_one_common_person_does_not_merge_different_groups(self):
        first,second=row(1),row(2)
        for item in [first,second]:
            v=item['_vision'];v['width']=v['height']=200
            v['faces']=[{'box':[0,0,.2,.2]},{'box':[.6,0,.2,.2]}]
            v['_points']=np.array([[5+i%10,5+i//10] for i in range(40)],np.float32)
            v['_descriptors']=np.zeros((40,32),np.uint8)
        matches=[[SimpleNamespace(queryIdx=i,trainIdx=i,distance=1),SimpleNamespace(distance=99)] for i in range(40)]
        matcher=SimpleNamespace(knnMatch=lambda *args,**kwargs:matches)
        with patch.object(cv2,'BFMatcher',return_value=matcher),patch.object(cv2,'estimateAffinePartial2D',return_value=(np.eye(2,3),np.ones((40,1),np.uint8))):
            self.assertFalse(cull.similarity(first,second)[0])
            for item in [first,second]:item['_vision']['_points'][20:,0]+=120
            self.assertTrue(cull.similarity(first,second)[0])


class CullingMeasurementTests(unittest.TestCase):
    def checker(self):return (np.indices((512,512)).sum(axis=0)//8%2*220+15).astype(np.uint8)

    def test_focus_decreases_with_gaussian_and_directional_blur(self):
        sharp=self.checker();defocus=cv2.GaussianBlur(sharp,(0,0),4)
        kernel=np.zeros((19,19));kernel[9,:]=1/19;motion=cv2.filter2D(sharp,-1,kernel)
        score=cull.focus_metric(sharp)['score']
        self.assertGreater(score,cull.focus_metric(defocus)['score']*2)
        self.assertGreater(score,cull.focus_metric(motion)['score']*1.5)
        features=cull.image_features(np.repeat(defocus[:,:,None],3,axis=2),np.repeat(defocus[:,:,None],3,axis=2)/255,{'available':False},EmptyDetector(),{})
        self.assertIn('POSSIBLE_DEFOCUS_OR_MOTION',features['reviewReasons'])

    def test_sensor_sampling_includes_every_cfa_phase_and_single_channel_is_not_all_clipped(self):
        colors=np.tile(np.array([[0,1],[3,2]],np.uint8),(24,24));image=np.full(colors.shape,300,np.uint16);image[colors==0]=1023
        raw=SimpleNamespace(raw_image_visible=image,raw_colors_visible=colors,black_level_per_channel=[64]*4,
                            camera_white_level_per_channel=None,white_level=1023)
        result=cull.sensor_statistics(raw)
        self.assertEqual(len(result['perCfaChannel']),4);self.assertAlmostEqual(result['saturatedFraction'],.25)
        display=np.full((256,256,3),180,np.uint8)
        measured=cull.image_features(display,display.astype(np.float32)/255,result,EmptyDetector(),{})
        self.assertNotIn('RAW_HIGHLIGHTS_WIDELY_CLIPPED',measured['reviewReasons'])

    def test_exposure_risk_uses_sensor_data_and_raster_does_not_claim_raw_loss(self):
        raw={'available':True,'nearBlackFraction':1.,'saturatedFraction':0.,'perCfaChannel':[{'saturatedFraction':0.}]*4}
        dark=np.zeros((256,256,3),np.uint8)
        result=cull.image_features(dark,dark.astype(np.float32),raw,EmptyDetector(),{})
        self.assertIn('RAW_SIGNAL_NEAR_BLACK_FLOOR',result['reviewReasons'])
        bright=np.full_like(dark,255);raw.update(nearBlackFraction=0.,saturatedFraction=1.,perCfaChannel=[{'saturatedFraction':1.}]*4)
        result=cull.image_features(bright,bright.astype(np.float32)/255,raw,EmptyDetector(),{})
        self.assertIn('RAW_HIGHLIGHTS_WIDELY_CLIPPED',result['reviewReasons'])
        raster=cull.image_features(bright,bright.astype(np.float32)/255,{'available':False},EmptyDetector(),{})
        self.assertIn('BRIGHT_RASTER_ORIGINAL_RAW_NEEDED',raster['reviewReasons'])
        self.assertNotIn('RAW_HIGHLIGHTS_WIDELY_CLIPPED',raster['reviewReasons'])

    def test_geometry_matches_crop_and_rotation_but_rejects_another_scene(self):
        rng=np.random.default_rng(12);image=np.full((640,640,3),100,np.uint8)
        for _ in range(90):
            center=tuple(map(int,rng.integers(30,610,size=2)));cv2.circle(image,center,int(rng.integers(4,20)),tuple(map(int,rng.integers(10,245,size=3))),-1)
        rotated=cv2.warpAffine(image,cv2.getRotationMatrix2D((320,320),12,1.08),(640,640),borderMode=cv2.BORDER_REFLECT)
        a=row(1);b=row(2)
        a['_vision']=cull.image_features(image,image.astype(np.float32)/255,{'available':False},EmptyDetector(),{})
        b['_vision']=cull.image_features(rotated,rotated.astype(np.float32)/255,{'available':False},EmptyDetector(),{})
        self.assertTrue(cull.similarity(a,b)[0])
        another=rng.integers(0,255,(640,640,3),dtype=np.uint8)
        b['_vision']=cull.image_features(another,another.astype(np.float32)/255,{'available':False},EmptyDetector(),{})
        self.assertFalse(cull.similarity(a,b)[0])


class CullingJobTests(unittest.TestCase):
    def test_matching_error_keeps_a_serializable_failure_report(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle,job,raw=fixtures.LocalEngineTests().fixture(Path(directory))
            request=json.loads((job/'request.json').read_text());request.update(operation='cull',catalogIdentity='D:/owned.lrcat')
            request['photos'][0]['isVirtualCopy']=False;(job/'request.json').write_text(json.dumps(request))
            def metadata(*args,**kwargs):return SimpleNamespace(returncode=0,stdout=json.dumps([{'SourceFile':str(raw)}]),stderr='')
            with patch.object(fixtures.engine,'runtime_info',return_value={}),patch.object(cull,'create_detector',return_value=EmptyDetector()),\
                 patch.object(cull,'load_image',return_value=(np.zeros((64,64,3),np.uint8),np.zeros((64,64,3),np.float32),{'available':False})),\
                 patch.object(cull,'image_features',return_value=vision()),patch.object(cull,'assign_groups',side_effect=ValueError('QA matching failed')),patch('subprocess.run',side_effect=metadata):
                report=fixtures.engine.run_job(job,bundle)
            self.assertEqual(report['status'],'FAILED');self.assertIn('QA matching failed',report['error'])
            saved=json.loads((job/'results.json').read_text());self.assertNotIn('_vision',saved['results'][0])

    def test_cancel_before_first_photo_does_not_read_or_choose_unprocessed_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle,job,raw=fixtures.LocalEngineTests().fixture(Path(directory))
            request=json.loads((job/'request.json').read_text());request.update(operation='cull',catalogIdentity='D:/owned.lrcat')
            (job/'request.json').write_text(json.dumps(request));(job/'cancel.request').write_text('cancel')
            with patch.object(fixtures.engine,'runtime_info',return_value={}),patch.object(cull,'create_detector',return_value=EmptyDetector()),patch.object(cull,'load_image') as load:
                report=fixtures.engine.run_job(job,bundle)
            load.assert_not_called();self.assertEqual(report['status'],'CANCELLED')
            self.assertEqual(report['analyzedPhotos'],0);self.assertEqual(report['suggestedKeepPhotos'],0)

    def test_missing_original_is_reported_without_becoming_a_keep(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle,job,raw=fixtures.LocalEngineTests().fixture(Path(directory));raw.unlink()
            request=json.loads((job/'request.json').read_text());request.update(operation='cull',catalogIdentity='D:/owned.lrcat')
            (job/'request.json').write_text(json.dumps(request))
            with patch.object(fixtures.engine,'runtime_info',return_value={}),patch.object(cull,'create_detector',return_value=EmptyDetector()):
                report=fixtures.engine.run_job(job,bundle)
            self.assertEqual(report['status'],'COMPLETED_WITH_ERRORS');self.assertEqual(report['failedPhotos'],1)
            self.assertEqual(report['suggestedKeepPhotos'],0)

    def test_culling_independent_of_style_model_and_preserves_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle,job,raw=fixtures.LocalEngineTests().fixture(Path(directory))
            (bundle/'Models/pilot-model.json').unlink() # Prove culling never requires style weights.
            request=json.loads((job/'request.json').read_text());request.update(operation='cull',catalogIdentity='D:/owned.lrcat')
            request['photos'][0]['isVirtualCopy']=False;(job/'request.json').write_text(json.dumps(request))
            digest=cull.sha256_file(raw)
            def metadata(*args,**kwargs):return SimpleNamespace(returncode=0,stdout=json.dumps([{'SourceFile':str(raw),'Model':'Other Camera'}]),stderr='')
            with patch.object(fixtures.engine,'runtime_info',return_value={}),patch.object(cull,'create_detector',return_value=EmptyDetector()),\
                 patch.object(cull,'load_image',return_value=(np.zeros((64,64,3),np.uint8),np.zeros((64,64,3),np.float32),{'available':False})),\
                 patch.object(cull,'image_features',return_value=vision()),patch('subprocess.run',side_effect=metadata):
                report=fixtures.engine.run_job(job,bundle)
            self.assertEqual(report['status'],'COMPLETED');self.assertEqual(report['suggestedKeepPhotos'],1)
            self.assertEqual(report['catalogWrites'],0);self.assertEqual(cull.sha256_file(raw),digest)
            self.assertTrue((job/'culling.csv').is_file());json.loads((job/'results.json').read_text())
            self.assertFalse((job/'references.jsonl').exists())


if __name__=='__main__':unittest.main()
