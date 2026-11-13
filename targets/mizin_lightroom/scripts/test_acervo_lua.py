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
                        Highlights2012=-20,Shadows2012=30,Whites2012=-50,Blacks2012=-5,Saturation=10,Vibrance=10,
                        HueAdjustmentOrange=hslChanged and -9 or -4,Texture=12}
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

    def test_extended_controls_reach_collection_but_not_the_queue_file(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime,module,calls=self.setup(Path(directory),count=3)
            module['import']('catalog')
            photo=[r for r in calls if r['operation']=='collect'][0]['photos'][0]
            self.assertEqual((photo['current']['HueAdjustmentOrange'],photo['current']['Texture']),(-4,12))
            queue=json.loads(next((Path(directory)/'MizinLightroomLocal/acervo').glob('*.json')).read_text())
            self.assertNotIn('HueAdjustmentOrange',queue['photos'][0]['current'])
            self.assertEqual(len(queue['photos'][0]['extendedSignature']),64)

    def test_hsl_change_after_approval_is_not_learned(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime,module,calls=self.setup(Path(directory),cancel=True)
            module['import']('catalog')
            runtime.execute('hslChanged=true')
            module.resume(False)
            batches=[r for r in calls if r['operation']=='collect']
            self.assertEqual(len(batches),1)

    def test_legacy_queue_without_extended_signature_still_resumes(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime,module,calls=self.setup(Path(directory),cancel=True)
            module['import']('catalog')
            path=next((Path(directory)/'MizinLightroomLocal/acervo').glob('*.json'))
            queue=json.loads(path.read_text())
            for row in queue['photos']:row.pop('extendedSignature')
            path.write_text(json.dumps(queue))
            runtime.execute('hslChanged=true')
            module.resume(False)
            processed=10+sum(len(r['photos']) for r in [r for r in calls if r['operation']=='collect'][1:])
            self.assertEqual(processed,51)

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

    @staticmethod
    def lua_int_array(values):
        return '{' + ','.join(str(int(v)) for v in values) + '}'

    def setup_collections(self, runtime, members):
        """members: list of (name, parent_name_or_None, photo_ids)."""
        runtime.execute('''
            function newCollectionSet(name) return {getName=function() return name end,getParent=function() return nil end} end
            function newCollection(name, parent, photoIds)
                local c={}
                c.getName=function() return name end
                c.getParent=function() return parent end
                c.getPhotos=function() local out={};for _,id in ipairs(photoIds) do out[#out+1]=byLocalId[id] end;return out end
                return c
            end
            byLocalId={};for _,p in ipairs(fixturePhotos) do byLocalId[p.localIdentifier]=p end
            allCollections={}
        ''')
        parents = {}
        for name, parent_name, photo_ids in members:
            if parent_name is not None and parent_name not in parents:
                runtime.execute(f"parent_{len(parents)}=newCollectionSet({json.dumps(parent_name)})")
                parents[parent_name] = f"parent_{len(parents)}"
        for index, (name, parent_name, photo_ids) in enumerate(members):
            parent_ref = parents.get(parent_name, 'nil')
            runtime.execute(
                f"allCollections[#allCollections+1]=newCollection({json.dumps(name)},{parent_ref},{self.lua_int_array(photo_ids)})"
            )
        runtime.execute('''
            for i,c in ipairs(allCollections) do c.localIdentifier=9000+i end
            catalog.getCollections=function(self) return allCollections end
        ''')

    def test_collection_scope_lists_full_parent_path_and_learns_its_photos(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime, module, calls = self.setup(Path(directory), count=60)
            self.setup_collections(runtime, [
                ('Auto 2026-11-07', 'CRISPIX - Edicao automatica', list(range(1, 56))),
            ])
            runtime.execute('''
                modules.LrDialogs.presentModalDialog=function(props)
                    dialogs[#dialogs+1]=props
                    if props.title=='Mizin Lightroom - escolher colecao para aprender' then
                        self_choice=props.contents[2].items[1].value
                        referenceProps.collection=self_choice
                        return 'ok'
                    end
                    referenceProps.approved=true;return 'ok'
                end
            ''')
            module['import']('collection')
            picker = runtime.globals().dialogs[1]
            self.assertEqual(picker['contents'][2]['items'][1]['title'], 'CRISPIX - Edicao automatica / Auto 2026-11-07')
            batches = [r for r in calls if r['operation'] == 'collect']
            self.assertEqual(sum(len(r['photos']) for r in batches), 55)
            self.assertEqual(runtime.globals().catalogWrites, 0)

    def test_collection_scope_allows_multiple_events_unlike_event_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime, module, calls = self.setup(Path(directory), count=4)
            runtime.execute('''
                fixturePhotos[1].getRawMetadata=function(self,key) if key=='isVirtualCopy' then return false end;if key=='pickStatus' then return 0 end;return 'D:/Evento A/CRI_1.CR3' end
                fixturePhotos[2].getRawMetadata=function(self,key) if key=='isVirtualCopy' then return false end;if key=='pickStatus' then return 0 end;return 'D:/Evento B/CRI_2.CR3' end
                -- Rebuild the path lookup used by catalog:findPhotoByPath after changing paths above.
                byPath={};for _,p in ipairs(fixturePhotos) do byPath[p:getRawMetadata('path')]=p end
            ''')
            self.setup_collections(runtime, [('Minha selecao', None, [1, 2])])
            runtime.execute('''
                modules.LrDialogs.presentModalDialog=function(props)
                    dialogs[#dialogs+1]=props
                    if props.title=='Mizin Lightroom - escolher colecao para aprender' then
                        referenceProps.collection=props.contents[2].items[1].value;return 'ok'
                    end
                    referenceProps.approved=true;return 'ok'
                end
            ''')
            module['import']('collection')  # must not raise "A selecao contem varios trabalhos"
            self.assertTrue(any(r['operation'] == 'collect' for r in calls))

    def test_cancelling_the_collection_picker_starts_no_job(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime, module, calls = self.setup(Path(directory), count=5)
            self.setup_collections(runtime, [('Qualquer', None, [1, 2, 3])])
            runtime.execute("modules.LrDialogs.presentModalDialog=function(props) dialogs[#dialogs+1]=props;return 'cancel' end")
            module['import']('collection')
            self.assertEqual(calls, [])
            self.assertEqual(runtime.globals().catalogWrites, 0)

    def test_no_collections_in_catalog_is_a_clear_error_not_a_crash(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime, module, calls = self.setup(Path(directory), count=3)
            runtime.execute('catalog.getCollections=function(self) return {} end')
            with self.assertRaisesRegex(Exception, 'Nenhuma colecao'):
                module['import']('collection')
            self.assertEqual(calls, [])

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
