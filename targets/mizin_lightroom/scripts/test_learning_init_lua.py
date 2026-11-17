"""Contract tests for LearningInit.lua's post-update welcome window: CheckUpdates.lua
writes pending-update-notice.json right before Lightroom closes to swap files; this is
the ONLY place where showing "update complete" is honest, since it only runs after the
new plugin has actually loaded on the next Lightroom startup."""
import json
import tempfile
import unittest
from pathlib import Path
from lupa.lua51 import LuaRuntime

ROOT = Path(__file__).resolve().parents[1]
LUA = ROOT / 'reconstructed/lightroom-pilot'


class LearningInitLuaTests(unittest.TestCase):
    def test_shows_welcome_window_and_deletes_marker_when_present(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            app_data = Path(temp) / 'appdata'
            data_root = app_data / 'MizinLightroomLocal'
            data_root.mkdir(parents=True)
            marker = data_root / 'pending-update-notice.json'
            marker.write_text(json.dumps({'fromVersion': 'v0.28.1 (build 0043)',
                                          'toVersion': 'v0.29.0 (build 0044)'}), encoding='utf-8')
            runtime = self.setup(plugin_dir, app_data)
            runtime.execute("dofile(plugin_path .. '/LearningInit.lua')")
            self.assertFalse(marker.exists(), 'marker must be consumed, not left behind')
            self.assertEqual(len(runtime.globals().modals), 1)
            modal = runtime.globals().modals[1]
            self.assertIn('Bem-vindo', modal['title'])

    def test_does_nothing_when_no_marker_present(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            app_data = Path(temp) / 'appdata'
            runtime = self.setup(plugin_dir, app_data)
            runtime.execute("dofile(plugin_path .. '/LearningInit.lua')")
            self.assertEqual(len(runtime.globals().modals), 0)

    def test_malformed_marker_is_deleted_without_crashing_startup(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            app_data = Path(temp) / 'appdata'
            data_root = app_data / 'MizinLightroomLocal'
            data_root.mkdir(parents=True)
            marker = data_root / 'pending-update-notice.json'
            marker.write_text('{not valid json', encoding='utf-8')
            runtime = self.setup(plugin_dir, app_data)
            # Must not raise: LrForceInitPlugin runs this on every Lightroom startup.
            runtime.execute("dofile(plugin_path .. '/LearningInit.lua')")
            self.assertFalse(marker.exists())
            self.assertEqual(len(runtime.globals().modals), 0)

    def setup(self, plugin_dir, app_data_dir):
        plugin_dir.mkdir(parents=True, exist_ok=True)
        app_data_dir.mkdir(parents=True, exist_ok=True)
        (plugin_dir / 'Json.lua').write_text((LUA / 'Json.lua').read_text(encoding='utf-8'), encoding='utf-8')
        (plugin_dir / 'LearningInit.lua').write_text(
            (LUA / 'LearningInit.lua').read_text(encoding='utf-8'), encoding='utf-8')
        # AutoEdit.lua is dofile'd by LearningInit.lua; stub it minimally so this test
        # stays scoped to the post-update window, not the unrelated watched-folder resume.
        (plugin_dir / 'AutoEdit.lua').write_text(
            "return { resumeIfEnabled = function() end }\n", encoding='utf-8')
        runtime = LuaRuntime(unpack_returned_tuples=True)
        runtime.globals().plugin_path = plugin_dir.as_posix()
        runtime.globals().appdata_path = app_data_dir.as_posix()
        runtime.execute('''
            modals = {}
            modules = {
                LrDialogs = {
                    presentModalDialog = function(opts)
                        modals[#modals+1] = opts
                        return 'ok'
                    end,
                },
                LrFileUtils = {
                    exists = function(p)
                        local f = io.open(p, 'rb')
                        if f then f:close(); return true end
                        return false
                    end,
                    delete = function(p) os.remove(p) end,
                },
                LrTasks = {
                    pcall = pcall,
                    startAsyncTask = function(fn) fn() end,
                    execute = function(command) return 0 end,
                },
                LrPathUtils = {
                    child = function(p, n) return p .. '/' .. n end,
                    getStandardFilePath = function(name) return appdata_path end,
                },
                LrView = {
                    defaultFactory = function()
                        return {
                            control_spacing = function() return 8 end,
                            row = function(t) return t end,
                            column = function(t) return t end,
                            spacer = function(t) return t end,
                            picture = function(t) return t end,
                            static_text = function(t) return t end,
                        }
                    end,
                },
            }
            import = function(name) assert(modules[name], name); return modules[name] end
            _PLUGIN = { path = plugin_path }
        ''')
        return runtime


if __name__ == '__main__':
    unittest.main(verbosity=2)
