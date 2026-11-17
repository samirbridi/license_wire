"""Acceleration.lua + PluginInfoProvider.lua: AI acceleration panel, re-test and CUDA component install."""
import json
from pathlib import Path
import tempfile
import unittest
from lupa.lua51 import LuaRuntime

ROOT = Path(__file__).resolve().parents[1]
LUA = ROOT / 'reconstructed/lightroom-pilot'
STATUS = {'schema': 'crispix.accelerator/1', 'chosen': 'cuda', 'chosenLabel': 'NVIDIA CUDA',
          'nvidia': {'available': True, 'primaryDevice': 'NVIDIA GeForce RTX 4090', 'vram': '24.0 GB', 'driver': 'CUDA 13.1'},
          'candidates': [{'name': 'cuda', 'label': 'NVIDIA CUDA', 'status': 'READY', 'medianMs': 1.234},
                         {'name': 'directml', 'label': 'DirectML (GPU DirectX 12)', 'status': 'READY', 'medianMs': 2.5},
                         {'name': 'cpu', 'label': 'CPU', 'status': 'READY', 'medianMs': 9.1}]}


class AccelerationLuaTests(unittest.TestCase):
    def setup(self, root, status=STATUS, install_result=None):
        plugin = root / 'Cris Bridi' / 'CRISPIX.lrplugin'
        (plugin / 'Engine').mkdir(parents=True)
        (plugin / 'Runtime').mkdir()
        (plugin / 'Runtime/pythonw.exe').write_text('')
        (plugin / 'Engine/accelerator.py').write_text('')
        for name in ('Json.lua', 'Acceleration.lua', 'PluginInfoProvider.lua'):
            (plugin / name).write_text((LUA / name).read_text(encoding='utf-8'), encoding='utf-8')
        data = root / 'appdata'
        (data / 'MizinLightroomLocal').mkdir(parents=True)
        if status is not None:
            (data / 'MizinLightroomLocal/accelerator.json').write_text(json.dumps(status), encoding='utf-8')
        temp = root / 'temp'
        temp.mkdir()
        runtime = LuaRuntime(unpack_returned_tuples=True)
        g = runtime.globals()
        g.plugin_path, g.app_data, g.temp_dir = plugin.as_posix(), data.as_posix(), temp.as_posix()
        g.install_result = json.dumps(install_result or {'stage': 'done', 'percent': 1, 'message': 'ok', 'chosenLabel': 'NVIDIA CUDA'})
        runtime.execute('''
            commands, messages, confirms, prefs = {}, {}, {}, {}
            confirm_answer = 'ok'
            local factory = setmetatable({}, {__index = function(_, name) return function(self, t) t._kind = name; return t end end})
            modules = {
                LrDialogs = {
                    message = function(title, body, kind) messages[#messages+1] = {title=title, body=body, kind=kind} end,
                    confirm = function(title, body) confirms[#confirms+1] = body; return confirm_answer end,
                    showModalProgressDialog = function() return {setPortionComplete=function() end, setCaption=function() end} end,
                },
                LrFileUtils = {
                    exists = function(p) local f = io.open(p, 'rb'); if f then f:close(); return true end; return false end,
                    delete = function(p) os.remove(p) end,
                },
                LrFunctionContext = {callWithContext = function(name, fn) return fn({}) end},
                LrPathUtils = {child = function(p, n) return p .. '/' .. n end,
                               getStandardFilePath = function(kind) if kind == 'temp' then return temp_dir end; return app_data end},
                LrPrefs = {prefsForPlugin = function() return prefs end},
                LrTasks = {
                    pcall = pcall, sleep = function() end, startAsyncTask = function(fn) fn() end,
                    execute = function(command)
                        commands[#commands+1] = command
                        if command:find('Install%-AccelPack') then
                            local f = io.open(temp_dir .. '/crispix_accel_progress.json', 'wb'); f:write(install_result); f:close()
                        end
                        return 0
                    end,
                },
                LrView = {bind = function(t) return t end},
                LrHttp = {},
            }
            import = function(name) assert(modules[name], name); return modules[name] end
            _PLUGIN = {path = plugin_path}
            viewFactory = factory
            local clock = 0
            os.time = function() clock = clock + 1; return clock end
        ''')
        accel = runtime.execute("return dofile(plugin_path .. '/Acceleration.lua')")
        return runtime, accel

    def test_status_and_description_of_each_provider(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime, accel = self.setup(Path(temp))
            status = accel.status()
            self.assertEqual(status.chosenLabel, 'NVIDIA CUDA')
            self.assertEqual(accel.describe(status.candidates[1]), 'pronto - 1.2 ms por inferencia de teste')
            old = runtime.table_from({'status': 'DRIVER_TOO_OLD', 'detail': 'driver R580'})
            self.assertIn('driver NVIDIA antigo (driver R580)', accel.describe(old))

    def test_retest_runs_the_engine_with_wrapped_quotes_and_the_saved_preference(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime, accel = self.setup(Path(temp))
            accel.setPreference('directml')
            accel.setPreference('tensorrt')  # invalid values are ignored
            accel.refresh(True)
            command = runtime.globals().commands[1]
            self.assertTrue(command.startswith('""') and command.endswith('"'))
            self.assertIn('accelerator.py" --status', command)
            self.assertIn('--preference directml --refresh', command)
            self.assertIn('Cris Bridi', command)

    def test_cuda_install_downloads_detached_and_reports_the_new_choice(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime, accel = self.setup(Path(temp))
            self.assertTrue(accel.installCuda())
            command = runtime.globals().commands[1]
            self.assertIn('Install-AccelPack.py" --detach --manifest "https://crispixlr.pages.dev/accel-cuda.json"', command)
            self.assertIn('1,3 GB', runtime.globals().confirms[1])
            message = runtime.globals().messages[1]
            self.assertEqual(message['kind'], 'info')
            self.assertIn('NVIDIA CUDA', message['body'])

    def test_cuda_install_failure_and_cancel_and_non_nvidia_machine(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime, accel = self.setup(Path(temp), install_result={'stage': 'error', 'percent': 0, 'message': 'Parte 2 chegou corrompida'})
            self.assertFalse(accel.installCuda())
            self.assertIn('corrompida', runtime.globals().messages[1]['body'])
            self.assertIn('Nada foi alterado', runtime.globals().messages[1]['body'])
            runtime.globals().confirm_answer = 'cancel'
            self.assertFalse(accel.installCuda())
            self.assertEqual(len(runtime.globals().commands), 1)
        with tempfile.TemporaryDirectory() as temp:
            runtime, accel = self.setup(Path(temp), status={**STATUS, 'nvidia': {'available': False}})
            self.assertFalse(accel.installCuda())
            self.assertEqual(len(runtime.globals().commands), 0)
            self.assertIn('Nenhuma GPU NVIDIA', runtime.globals().messages[1]['body'])

    def test_panel_lists_every_provider_and_saves_a_changed_preference(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime, _ = self.setup(Path(temp))
            provider = runtime.execute("return dofile(plugin_path .. '/PluginInfoProvider.lua')")
            properties = runtime.table_from({})
            provider.startDialog(properties)
            self.assertEqual(properties.accelPreference, 'auto')
            sections = provider.sectionsForBottomOfDialog(runtime.globals().viewFactory, properties)
            texts = []
            def walk(node):
                if hasattr(node, 'values'):
                    if node['title']:
                        texts.append(str(node['title']))
                    for value in node.values():
                        walk(value)
            walk(sections)
            joined = '\n'.join(texts)
            for expected in ('Aceleracao por IA', 'NVIDIA CUDA', 'RTX 4090', 'DirectML', 'Testar novamente', 'Instalar aceleracao NVIDIA'):
                self.assertIn(expected, joined)
            properties.accelPreference = 'cpu'
            provider.endDialog(properties)
            self.assertEqual(runtime.globals().prefs.accelPreference, 'cpu')
            self.assertIn('--preference cpu', runtime.globals().commands[1])


if __name__ == '__main__':
    unittest.main()
