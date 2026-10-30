import json
import tempfile
import unittest
from pathlib import Path

import test_local_lua as fixtures

LUA=fixtures.LUA


class AcervoLuaTests(unittest.TestCase):
    def setup(self,folder,count=51,approve=True,mutate=False,cancel=False):
        runtime=fixtures.LocalLuaTests().setup_native(folder)
        runtime.globals().acervo_count=count;runtime.globals().acervo_approve=approve;runtime.globals().mutate_on_approval=mutate
        runtime.execute('''
            uuidCounter=0;modules.LrUUID.generateUUID=function() uuidCounter=uuidCounter+1;return 'fixture-'..uuidCounter end
            catalog.getPath=function() return 'D:/Catalogos/Teste.lrcat' end
            fixturePhotos={};byPath={};settingsChanged=false
            for i=1,acervo_count do
                local identifier=i
                local p={localIdentifier=identifier}
                p.getRawMetadata=function(self,key)
                    if key=='isVirtualCopy' then return false end
                    if key=='pickStatus' then return 0 end
                    return 'D:/2026-10-24 - Evento/100EOSR6/CRI_'..identifier..'.CR3'
                end
                p.getDevelopSettings=function()
                    return {Exposure2012=settingsChanged and 1.25 or .5,Temperature=5000,Tint=2,Contrast2012=20,
                        Highlights2012=-20,Shadows2012=30,Whites2012=-50,Blacks2012=-5,Saturation=10,Vibrance=10}
                end
                fixturePhotos[i]=p;byPath[p:getRawMetadata('path')]=p
            end
            catalog.findPhotos=function(self,query) searchQuery=query;return fixturePhotos end
            catalog.findPhotoByPath=function(self,path) return byPath[path] end
            modules.LrDialogs.presentModalDialog=function(props)
                dialogs[#dialogs+1]=props
                if acervo_approve then referenceProps.approved=true;settingsChanged=mutate_on_approval;return 'ok' end
                return 'cancel'
            end
        ''')
        calls=[]
        def execute(job):
            path=Path(job);request=json.loads((path/'request.json').read_text());calls.append(request)
            photos=request.get('photos',[]);cancelled=cancel and len([r for r in calls if r['operation']=='collect'])==1
            used=photos[:10] if cancelled else photos
            report={'schema':'mizin-lightroom.selection-analysis/1','operation':request['operation'],
                    'status':'CANCELLED' if cancelled else 'COMPLETED','collectedReferences':len(used),'failedPhotos':0,
                    'results':[{'status':'REFERENCE_COLLECTED'} for _ in used]}
            (path/'results.json').write_text(json.dumps(report))
        runtime.globals().mock_execute=execute
        return runtime,runtime.execute((LUA/'AcervoLearning.lua').read_text()),calls

    def test_catalog_approval_queues_more_than_100_photos_without_selection_or_catalog_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime,module,calls=self.setup(Path(directory),count=121)
            module['import']('catalog')
            batches=[r for r in calls if r['operation']=='collect']
            self.assertEqual(sum(len(r['photos']) for r in batches),121)
            self.assertTrue(all(len(r['photos'])<=25 for r in batches))
            self.assertEqual(runtime.globals().searchQuery['searchDesc']['criteria'],'hasAdjustments')
            self.assertEqual(runtime.globals().catalogWrites,0)
            self.assertEqual(calls[-1]['operation'],'learning-update')

    def test_no_approval_means_no_background_jobs(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime,module,calls=self.setup(Path(directory),approve=False)
            module['import']('catalog');self.assertEqual(calls,[])
            self.assertFalse((Path(directory)/'MizinLightroomLocal/acervo').exists())

    def test_changes_after_confirmation_do_not_become_approved_training_examples(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime,module,calls=self.setup(Path(directory),mutate=True)
            module['import']('catalog')
            self.assertFalse(any(r['operation']=='collect' for r in calls))
            self.assertIn('51',runtime.globals().messages[1]['body'])

    def test_partial_cancel_and_torn_journal_resume_without_losing_unprocessed_photos(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime,module,calls=self.setup(Path(directory),cancel=True)
            module['import']('catalog')
            queue_path=next((Path(directory)/'MizinLightroomLocal/acervo').glob('*.json'))
            with Path(str(queue_path)+'.journal').open('a') as stream:stream.write('\n{"torn":')
            module.resume(False)
            batches=[r for r in calls if r['operation']=='collect']
            processed=10+sum(len(r['photos']) for r in batches[1:])
            self.assertEqual(processed,51)
            self.assertEqual(calls[-1]['operation'],'learning-update')

    def test_a_queue_does_not_continue_in_a_different_catalog(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime,module,calls=self.setup(Path(directory),cancel=True)
            module['import']('catalog');count=len(calls)
            runtime.execute("catalog.getPath=function() return 'D:/Catalogos/Outro.lrcat' end")
            module.resume(True)
            self.assertEqual(len(calls),count)

    def test_feedback_dialog_saves_opinion_without_collecting_current_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime,module,calls=self.setup(Path(directory))
            runtime.execute("modules.LrDialogs.presentModalDialog=function(props) referenceProps.rating='GOOD';referenceProps.note='Gostei';referenceProps.ask=true;return 'ok' end")
            module.feedback()
            self.assertEqual(len(calls),1)
            self.assertEqual(calls[0]['operation'],'feedback')
            self.assertEqual(calls[0]['feedback']['rating'],'GOOD')
            self.assertNotIn('photos',calls[0])


if __name__=='__main__':unittest.main(verbosity=2)
