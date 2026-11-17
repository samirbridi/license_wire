import json
import tempfile
import unittest
from pathlib import Path
import test_local_lua as fixtures

LUA=fixtures.LUA


class CullingLuaTests(unittest.TestCase):
    def setup(self,folder):
        runtime=fixtures.LocalLuaTests().setup_native(folder)
        runtime.execute('''
            photo.localIdentifier=44
            catalog.getPath=function() return 'D:/owned.lrcat' end
            collections,sets,activeSource={}, {}, nil
            catalog.withWriteAccessDo=function(self,title,fn,opts) catalogWrites=catalogWrites+1;return fn() end
            catalog.createCollectionSet=function(self,name,parent,existing)
                assert(existing==true);sets[name]=sets[name] or {name=name};return sets[name]
            end
            catalog.createCollection=function(self,name,parent,existing)
                assert(existing==true)
                collections[name]=collections[name] or {photos={},addPhotos=function(self,photos)
                    assert(catalogWrites>=2,'Must commit collections before populating')
                    for _,p in ipairs(photos) do self.photos[tostring(p.localIdentifier)]=true end
                end};return collections[name]
            end
            catalog.findPhotoByPath=function(self,path) return photo end
            catalog.setActiveSources=function(self,sources) activeSource=sources[1] end
        ''')
        module=runtime.execute((LUA/'CullingReview.lua').read_text())
        return runtime,module

    def report(self,runtime,reasons=()):
        value={'operation':'cull','algorithm':'MIZIN_LOCAL_CULL_V1','catalogIdentity':'D:/owned.lrcat','jobId':'owned-job',
               'maximumPerSimilarGroup':4,'results':[{'id':'44','path':'D:/owned.CR3','groupId':'G1','status':'CULL_ANALYZED','suggestedKeep':True,'reviewReasons':list(reasons)}]}
        return runtime.execute((LUA/'Json.lua').read_text()).decode(json.dumps(value))

    def test_collections_use_two_write_gates_overlap_quality_and_do_not_change_flags(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime,module=self.setup(Path(directory))
            report=self.report(runtime,['POSSIBLE_DEFOCUS_OR_MOTION','RAW_HIGHLIGHTS_WIDELY_CLIPPED'])
            self.assertTrue(module.createCollections(report))
            self.assertEqual(runtime.globals().catalogWrites,2)
            for name in ['01 - Escolhidas','03 - Revisar foco ou movimento','04 - Revisar exposicao']:
                self.assertTrue(runtime.globals().collections[name].photos['44'])
            self.assertIsNotNone(runtime.globals().activeSource)
            module.createCollections(report)
            self.assertEqual(runtime.globals().catalogWrites,2)

    def test_wrong_catalog_or_changed_photo_identity_stops_before_any_write(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime,module=self.setup(Path(directory));report=self.report(runtime)
            report.catalogIdentity='D:/other.lrcat'
            with self.assertRaises(Exception):module.createCollections(report)
            report.catalogIdentity='D:/owned.lrcat';runtime.execute('photo.localIdentifier=99')
            with self.assertRaises(Exception):module.createCollections(report)
            self.assertEqual(runtime.globals().catalogWrites,0)

    def test_invalid_keep_limit_is_rejected_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime,module=self.setup(Path(directory));report=self.report(runtime)
            report.maximumPerSimilarGroup=0
            with self.assertRaises(Exception):module.createCollections(report)
            self.assertEqual(runtime.globals().catalogWrites,0)

    def test_culling_command_captures_catalog_identity_and_explicit_options(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime,_=self.setup(Path(directory))
            runtime.execute('''
                modules.LrDialogs.presentModalDialog=function(props)
                    if props.title=='Mizin Lightroom - selecao local' then referenceProps.maximum=4;return 'ok' end
                    return 'cancel'
                end
            ''')
            received=[]
            def execute(job):
                request=json.loads((Path(job)/'request.json').read_text());received.append(request)
                report={'schema':'mizin-lightroom.selection-analysis/1','operation':'cull','status':'COMPLETED',
                        'jobId':request['jobId'],'catalogIdentity':request['catalogIdentity'],'results':[]}
                (Path(job)/'results.json').write_text(json.dumps(report))
            runtime.globals().mock_execute=execute
            engine=runtime.execute((LUA/'LocalAnalysis.lua').read_text());engine.run('cull')
            self.assertEqual(received[0]['catalogIdentity'],'D:/owned.lrcat')
            self.assertEqual(received[0]['photos'][0]['id'],'44')
            self.assertFalse(received[0]['photos'][0]['isVirtualCopy'])
            self.assertEqual(received[0]['cullingOptions']['maxPerGroup'],4)
            # Default stays the RAW render (measured: same decisions as before), remembered for next time.
            self.assertEqual(received[0]['cullingOptions']['previewSource'],'raw')
            self.assertEqual(runtime.globals().prefs.cullPreviewSource,'raw')
            self.assertEqual(runtime.globals().catalogWrites,0)

    def test_culling_remembers_embedded_preview_choice(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime,_=self.setup(Path(directory))
            runtime.execute('''
                prefs.cullPreviewSource='embedded'
                modules.LrDialogs.presentModalDialog=function(props)
                    if props.title=='Mizin Lightroom - selecao local' then return 'ok' end
                    return 'cancel'
                end
            ''')
            received=[]
            def execute(job):
                request=json.loads((Path(job)/'request.json').read_text());received.append(request)
                (Path(job)/'results.json').write_text(json.dumps({'schema':'mizin-lightroom.selection-analysis/1','operation':'cull',
                    'status':'COMPLETED','jobId':request['jobId'],'catalogIdentity':request['catalogIdentity'],'results':[]}))
            runtime.globals().mock_execute=execute
            runtime.execute((LUA/'LocalAnalysis.lua').read_text()).run('cull')
            self.assertEqual(received[0]['cullingOptions']['previewSource'],'embedded')

    def test_declining_options_does_not_launch_engine(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime,_=self.setup(Path(directory))
            engine=runtime.execute((LUA/'LocalAnalysis.lua').read_text());engine.run('cull')
            self.assertEqual(runtime.globals().launches,0)
            self.assertEqual(runtime.globals().catalogWrites,0)


if __name__=='__main__':unittest.main()
