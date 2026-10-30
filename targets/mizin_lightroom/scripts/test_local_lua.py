import json
import tempfile
import unittest
from pathlib import Path
from lupa.lua51 import LuaRuntime

ROOT = Path(__file__).resolve().parents[1]
LUA = ROOT / 'reconstructed/lightroom-pilot'


class LocalLuaTests(unittest.TestCase):
    def codec(self):
        runtime = LuaRuntime(unpack_returned_tuples=True)
        return runtime, runtime.execute((LUA / 'Json.lua').read_text(encoding='utf-8'))

    def test_paths_unicode_quotes_and_controls_are_data(self):
        runtime, codec = self.codec()
        original = {'path': 'D:\\Fotos & familias\\ç😀\\x"; error("no") --.CR3', 'text': 'linha\n\t\x00', 'n': -.25, 'bool': False}
        parsed = codec.decode(json.dumps(original))
        self.assertEqual(json.loads(codec.encode(parsed)), original)
        self.assertEqual(codec.decode('"\\ud83d\\ude00"'), '😀')

    def test_malformed_json_and_nonfinite_values_are_rejected(self):
        runtime, codec = self.codec()
        for text in ('{"a":1,"a":2}', '[1,]', '01', '1.', '1e+', '1e999', '"\\ud800"', 'true trailing', '{"x":NaN}'):
            with self.subTest(text=text), self.assertRaises(Exception): codec.decode(text)

    def setup_native(self, folder, selected=True, count=1):
        runtime = LuaRuntime(unpack_returned_tuples=True)
        runtime.globals().plugin_path = LUA.as_posix()
        runtime.globals().app_data = folder.as_posix()
        runtime.globals().has_selection = selected
        runtime.globals().selection_count = count
        runtime.execute('''
            launches, catalogWrites, messages, dialogs = 0, 0, {}, {}
            prefs={}
            referenceChoice='cancel'
            photo={getDevelopSettings=function() return {Exposure2012=.83,Temperature=4957,Contrast2012=34,Tint=-2,
                    Highlights2012=-38,Shadows2012=32,Whites2012=-59,Blacks2012=-4,Saturation=11,Vibrance=10} end,
                getRawMetadata=function(self,key) if key=='isVirtualCopy' then return false end; return 'D:\\\\Fotografias & eventos\\\\foto.CR3' end}
            catalog={getTargetPhoto=function() if has_selection then return photo end end,
                getTargetPhotos=function() local a={} for i=1,selection_count do a[i]=photo end return a end,
                withWriteAccessDo=function() catalogWrites=catalogWrites+1; error('Unexpected catalog write') end}
            factory=setmetatable({control_spacing=function() return 4 end},{__index=function(self,key) return function(self,props) return props end end})
            modules={
                LrApplication={activeCatalog=function() return catalog end,versionString=function() return 'SDK_DOUBLE' end},
                LrBinding={makePropertyTable=function() referenceProps={};return referenceProps end},
                LrDate={currentTime=function() return 1 end},
                LrDialogs={message=function(title,body,kind) messages[#messages+1]={title=title,body=body,kind=kind} end,
                    presentModalDialog=function(props)
                        dialogs[#dialogs+1]=props
                        if props.title=='Mizin Lightroom - coletar referencias aprovadas' and referenceChoice=='approve' then
                            referenceProps.eventName='2026-10-24 - Evento de teste';referenceProps.approved=true;return 'ok'
                        end
                        return 'cancel'
                    end},
                LrFileUtils={createAllDirectories=function(path) mkdir(path) end,exists=function(path) return exists(path) end},
                LrFunctionContext={callWithContext=function(name,fn) return fn({}) end},
                LrPathUtils={child=function(p,n) return p..'/'..n end,getStandardFilePath=function() return app_data end},
                LrPrefs={prefsForPlugin=function() return prefs end},
                LrProgressScope=function() return {isCanceled=function() return false end,setCaption=function() end,setPortionComplete=function() end,done=function() end} end,
                LrShell={revealInShell=function() error('Unexpected shell launch') end},
                LrTasks={startAsyncTask=function(fn) fn() end,pcall=pcall,execute=function(command) launches=launches+1; launchedCommand=command; mock_execute(prefs.lastDataRun or prefs.lastSelectionRun); return 0 end,
                    sleep=function() error('Unexpected wait in synchronous SDK double') end,yield=function() end},
                LrUUID={generateUUID=function() return 'fixture-job' end},
                LrView={osFactory=function() return factory end,bind=function(key) return key end}
            }
            import=function(name) assert(modules[name],name);return modules[name] end
            _PLUGIN={path=plugin_path}
        ''')
        runtime.globals().mkdir = lambda path: Path(path).mkdir(parents=True, exist_ok=True)
        runtime.globals().exists = lambda path: path.startswith(LUA.as_posix() + '/') or Path(path).exists()
        def execute(job):
            self.request = json.loads((Path(job) / 'request.json').read_text(encoding='utf-8'))
            result = {'schema': 'mizin-lightroom.selection-analysis/1', 'status': 'COMPLETED', 'operation': 'analyze',
                      'computedPhotos': 1, 'failedPhotos': 0, 'styleName': 'Fixture', 'results': [
                          {'filename': 'foto.CR3', 'status': 'COMPUTED', 'current': self.request['photos'][0]['current'],
                           'predictions': {'Exposure2012': .25, 'Temperature': 5000, 'Contrast2012': 20}, 'missingFeatures': []}]}
            if self.request['operation'] == 'collect':
                result.update({'operation': 'collect', 'computedPhotos': 0, 'collectedReferences': 1,
                               'referenceBatch': {'eventName': self.request['eventName']}})
                result['results'][0]['status'] = 'REFERENCE_COLLECTED'
                (Path(job) / 'references.jsonl').write_text('{"fixture":true}\n')
            (Path(job) / 'results.json').write_text(json.dumps(result), encoding='utf-8')
        runtime.globals().mock_execute = execute
        return runtime

    def test_selected_photo_is_serialized_and_result_shown_without_catalog_writes(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup_native(Path(temp))
            runtime.execute((LUA / 'AnalyzeSelected.lua').read_text(encoding='utf-8'))
            self.assertEqual(runtime.globals().launches, 1)
            self.assertEqual(runtime.globals().catalogWrites, 0)
            self.assertEqual(len(runtime.globals().dialogs), 1)
            self.assertEqual(self.request['photos'][0]['current']['Exposure2012'], .83)
            self.assertIn('Fotografias & eventos', self.request['photos'][0]['path'])
            self.assertNotIn('Fotografias', runtime.globals().launchedCommand)
            self.assertEqual(len(runtime.globals().messages), 0)

    def test_no_selection_does_not_process_the_filmstrip(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup_native(Path(temp), selected=False, count=5000)
            runtime.execute((LUA / 'AnalyzeSelected.lua').read_text(encoding='utf-8'))
            self.assertEqual(runtime.globals().launches, 0)
            self.assertIn('Selecione explicitamente', runtime.globals().messages[1]['body'])

    def test_oversized_selection_is_not_started(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup_native(Path(temp), count=101)
            runtime.execute((LUA / 'AnalyzeSelected.lua').read_text(encoding='utf-8'))
            self.assertEqual(runtime.globals().launches, 0)
            self.assertIn('lote menor', runtime.globals().messages[1]['body'])

    def test_command_rejects_shell_expansion_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup_native(Path(temp))
            module = runtime.execute((LUA / 'LocalAnalysis.lua').read_text(encoding='utf-8'))
            for path in ('C:/%USERPROFILE%/plugin', 'C:/plugin!name', 'C:/bad"name'):
                with self.subTest(path=path), self.assertRaises(Exception): module.command(path, 'C:/jobs/1')

    def test_incomplete_package_is_reported_before_launching(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup_native(Path(temp))
            runtime.globals().exists = lambda path: False
            runtime.execute((LUA / 'AnalyzeSelected.lua').read_text(encoding='utf-8'))
            self.assertEqual(runtime.globals().launches, 0)
            self.assertIn('Pacote incompleto', runtime.globals().messages[1]['body'])

    def test_reference_collection_requires_approval_and_preserves_negative_tint(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup_native(Path(temp))
            runtime.globals().referenceChoice = 'approve'
            runtime.execute((LUA / 'CollectReferences.lua').read_text(encoding='utf-8'))
            self.assertEqual(runtime.globals().launches, 1)
            self.assertTrue(self.request['referencesApproved'])
            self.assertEqual(self.request['eventName'], '2026-10-24 - Evento de teste')
            self.assertEqual(self.request['photos'][0]['current']['Tint'], -2)
            self.assertFalse(self.request['photos'][0]['isVirtualCopy'])
            self.assertEqual(runtime.globals().catalogWrites, 0)
            self.assertEqual(len(runtime.globals().messages), 0)

    def test_cancelled_reference_approval_does_not_create_a_job(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup_native(Path(temp))
            runtime.execute((LUA / 'CollectReferences.lua').read_text(encoding='utf-8'))
            self.assertEqual(runtime.globals().launches, 0)
            self.assertFalse((Path(temp) / 'MizinLightroomLocal/jobs').exists())

    def test_canon_subfolder_suggests_event_parent_without_changing_approval(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup_native(Path(temp))
            module = runtime.execute((LUA / 'LocalAnalysis.lua').read_text(encoding='utf-8'))
            self.assertEqual(module.suggestEventName('D:/2026-10-24 - Evento/100EOSR6/foto.CR3'), '2026-10-24 - Evento')

    def test_collection_reveals_data_package_and_distinguishes_skipped_photos(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);runtime=self.setup_native(folder)
            report={'schema':'mizin-lightroom.selection-analysis/1','status':'COMPLETED_WITH_SKIPS',
                    'operation':'collect','collectedReferences':1,'failedPhotos':0,'skippedPhotos':1,
                    'referenceBatch':{'eventName':'Evento'},'referenceBundleFile':'references-package.zip',
                    'results':[{'filename':'mono.CR3','status':'SKIPPED','message':'Foto em P&B ignorada'}]}
            (folder/'results.json').write_text(json.dumps(report))
            (folder/'references-package.zip').write_bytes(b'package existence fixture')
            runtime.globals().exists=lambda path:'file' if Path(path).is_file() else False
            revealed=[];runtime.globals().reveal=lambda path:revealed.append(path)
            runtime.execute("modules.LrShell.revealInShell=function(path) reveal(path) end; modules.LrDialogs.presentModalDialog=function(props) dialogs[#dialogs+1]=props;return 'ok' end")
            module=runtime.execute((LUA/'LocalAnalysis.lua').read_text())
            module.showResults(folder.as_posix())
            self.assertEqual(revealed,[(folder/'references-package.zip').as_posix()])
            dialog=runtime.globals().dialogs[1]
            self.assertEqual(dialog['actionVerb'],'Mostrar pacote de referencias')
            self.assertIn('ignoradas: 1 | falhas: 0',dialog['contents'][2]['title'])


if __name__ == '__main__': unittest.main(verbosity=2)
