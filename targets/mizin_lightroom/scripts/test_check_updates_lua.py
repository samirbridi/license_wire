"""Contract tests for CheckUpdates.lua: tries the internet manifest (LrHttp.get) first,
falls back to the network-share manifest (plain io.open) if the internet call fails, and
either reports up to date, offers to reveal the updater, or reports both channels as
unreachable. No catalog or photo API is touched, so this uses a minimal standalone Lua
double rather than the full setup_native() fixture.
"""
import json
import tempfile
import unittest
from pathlib import Path
from lupa.lua51 import LuaRuntime

ROOT = Path(__file__).resolve().parents[1]
LUA = ROOT / 'reconstructed/lightroom-pilot'
REAL_INTERNET_URL = 'https://crispixlr.pages.dev/latest.json'
REAL_NETWORK_CHANNEL = r"\\\\192.168.1.58\\Users\\Public\\Documents\\MizinLightroomPilot"


class CheckUpdatesLuaTests(unittest.TestCase):
    def test_busy_editor_blocks_updating_without_network_or_launch(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup(Path(temp) / 'plugin', 'v0.24.1 (build 0038)')
            runtime.globals().MizinEditorBusy = True
            self.patch_network_channel(runtime, Path(temp) / 'unused')
            self.assertEqual(len(runtime.globals().httpCalls), 0)
            self.assertEqual(len(runtime.globals().revealed), 0)
            self.assertIn('Aguarde', runtime.globals().messages[1]['body'])

    def test_launcher_failure_is_reported_in_lightroom(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup(Path(temp) / 'plugin', 'v0.24.1 (build 0038)')
            runtime.globals().http_response = json.dumps({'version': 'v0.25.0 (build 0039)', 'build': 39})
            runtime.globals().confirm_answer = 'ok'
            runtime.globals().launchCode = 1
            self.patch_network_channel(runtime, Path(temp) / 'unused')
            self.assertIn('Nao foi possivel iniciar', runtime.globals().messages[1]['body'])

    def test_http_get_can_yield_across_sdk_pcall(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup(Path(temp) / 'plugin', 'v0.24.1 (build 0038)')
            runtime.execute('''
                -- Emulate Lightroom's yield-aware pcall, unlike stock Lua 5.1 pcall.
                modules.LrTasks.pcall=function(fn)
                    local thread=coroutine.create(fn)
                    local ok,value=coroutine.resume(thread)
                    while ok and coroutine.status(thread)~='dead' do
                        coroutine.yield(value);ok,value=coroutine.resume(thread)
                    end
                    return ok,value
                end
                modules.LrTasks.startAsyncTask=function(fn)
                    task=coroutine.create(fn)
                    local ok,err=coroutine.resume(task);assert(ok,err)
                end
                modules.LrHttp.get=function()
                    coroutine.yield('network')
                    return '{"version":"v0.25.0 (build 0039)","build":39}'
                end
            ''')
            self.patch_network_channel(runtime, Path(temp) / 'unused')
            self.assertEqual(len(runtime.globals().messages), 0)
            self.assertEqual(runtime.eval('coroutine.status(task)'), 'suspended')
            runtime.execute('local ok,err=coroutine.resume(task);assert(ok,err)')
            self.assertEqual(len(runtime.globals().confirms), 1)

    def setup(self, plugin_dir, local_version=None):
        plugin_dir.mkdir(parents=True, exist_ok=True)
        # CheckUpdates.lua does `dofile(child(_PLUGIN.path,'Json.lua'))`; use the real module,
        # same as the full-fixture tests do for every other Lua entry point.
        (plugin_dir / 'Json.lua').write_text((LUA / 'Json.lua').read_text(encoding='utf-8'), encoding='utf-8')
        if local_version is not None:
            (plugin_dir / 'BuildInfo.json').write_text(
                json.dumps({'version': local_version}), encoding='utf-8')
        runtime = LuaRuntime(unpack_returned_tuples=True)
        runtime.globals().plugin_path = plugin_dir.as_posix()
        runtime.execute('''
            messages, confirms, revealed, httpCalls = {}, {}, {}, {}
            modules = {
                LrApplication = {},
                LrDialogs = {
                    message = function(title, body, kind) messages[#messages+1] = {title=title, body=body, kind=kind} end,
                    confirm = function(title, body, actionVerb, cancelVerb)
                        confirms[#confirms+1] = {title=title, body=body}
                        return confirm_answer or 'cancel'
                    end,
                },
                LrHttp = {
                    get = function(url, headers, timeout)
                        httpCalls[#httpCalls+1] = url
                        if http_response == false then return nil end
                        return http_response or nil
                    end,
                },
                LrPathUtils = { child = function(p, n) return p .. '/' .. n end },
                LrShell = { revealInShell = function(path) revealed[#revealed+1] = path end },
                LrTasks = { pcall=pcall, startAsyncTask = function(fn) fn() end,
                    execute=function(command) revealed[#revealed+1]=command;return launchCode or 0 end },
            }
            import = function(name) assert(modules[name], name); return modules[name] end
            _PLUGIN = { path = plugin_path }
        ''')
        return runtime

    def patch_network_channel(self, runtime, channel_dir):
        # CheckUpdates.lua hardcodes the UNC fallback path; tests redirect it to a temp dir
        # by loading the file text with the real path replaced, rather than touching the
        # real network share. Keep the replacement narrow (exact literal only).
        source = (LUA / 'CheckUpdates.lua').read_text(encoding='utf-8')
        self.assertIn(REAL_NETWORK_CHANNEL, source, 'CheckUpdates.lua network channel literal changed; update this test')
        self.assertIn(REAL_INTERNET_URL, source, 'CheckUpdates.lua internet URL literal changed; update this test')
        patched = source.replace(REAL_NETWORK_CHANNEL, channel_dir.as_posix())
        runtime.execute(patched)

    def test_internet_reachable_and_up_to_date_never_touches_the_network_share(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            runtime = self.setup(plugin_dir, local_version='v0.22.0 (build 0035)')
            runtime.globals().http_response = json.dumps({'version': 'v0.22.0 (build 0035)', 'build': 35})
            self.patch_network_channel(runtime, Path(temp) / 'unused-network-channel')
            self.assertEqual(list(runtime.globals().httpCalls.values()), [REAL_INTERNET_URL])
            self.assertEqual(len(runtime.globals().confirms), 0)
            body = runtime.globals().messages[1]['body']
            self.assertIn('ja esta usando a versao mais recente', body.replace('á', 'a').replace('í', 'i'))
            self.assertIn('internet', body)

    def test_internet_offers_update_and_mentions_the_internet_channel(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            runtime = self.setup(plugin_dir, local_version='v0.21.0 (build 0034)')
            runtime.globals().http_response = json.dumps({'version': 'v0.22.0 (build 0040)', 'build': 40,
                                                            'downloadUrl': 'https://crispixlr.pages.dev/x.zip'})
            runtime.globals().confirm_answer = 'ok'
            self.patch_network_channel(runtime, Path(temp) / 'unused-network-channel')
            self.assertEqual(len(runtime.globals().confirms), 1)
            body = runtime.globals().confirms[1]['body']
            self.assertIn('build 0034', body)
            self.assertIn('build 0040', body)
            self.assertIn('mantidos', body.replace('ã', 'a'))
            self.assertIn('internet', body)
            self.assertEqual(len(runtime.globals().revealed), 1)
            self.assertIn('Launch-CrispixUpdate.py', runtime.globals().revealed[1])

    def test_internet_manifest_with_utf8_bom_is_still_read(self):
        # Regression (build 0037 publication): the live manifest was served with a UTF-8 BOM,
        # Json.decode rejected it and the internet channel silently never answered.
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            runtime = self.setup(plugin_dir, local_version='v0.23.0 (build 0036)')
            manifest = json.dumps({'version': 'v0.24.0 (build 0037)', 'build': '0037',
                                   'downloadUrl': 'https://example.invalid/x.zip'})
            # Bytes, not str: lupa would UTF-8-encode '\xef\xbb\xbf' into 6 bytes instead of the BOM.
            runtime.globals().http_response = b'\xef\xbb\xbf' + manifest.encode('utf-8')
            self.patch_network_channel(runtime, Path(temp) / 'unused-network-channel')
            self.assertEqual(len(runtime.globals().confirms), 1)
            body = runtime.globals().confirms[1]['body']
            self.assertIn('build 0037', body)
            self.assertIn('internet', body)

    def test_internet_down_falls_back_to_network_share(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            channel_dir = Path(temp) / 'channel'
            channel_dir.mkdir(parents=True)
            (channel_dir / 'latest.json').write_text(
                json.dumps({'version': 'v0.22.0 (build 0040)', 'build': 40}), encoding='utf-8')
            runtime = self.setup(plugin_dir, local_version='v0.21.0 (build 0034)')
            runtime.globals().http_response = False  # LrHttp.get returns nil: network failure
            runtime.globals().confirm_answer = 'ok'
            self.patch_network_channel(runtime, channel_dir)
            self.assertEqual(list(runtime.globals().httpCalls.values()), [REAL_INTERNET_URL])
            self.assertEqual(len(runtime.globals().confirms), 1)
            body = runtime.globals().confirms[1]['body']
            self.assertIn('rede local', body)
            self.assertEqual(len(runtime.globals().revealed), 1)

    def test_malformed_internet_response_falls_back_to_network_share(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            channel_dir = Path(temp) / 'channel'
            channel_dir.mkdir(parents=True)
            (channel_dir / 'latest.json').write_text(
                json.dumps({'version': 'v0.22.0 (build 0040)', 'build': 40}), encoding='utf-8')
            runtime = self.setup(plugin_dir, local_version='v0.21.0 (build 0034)')
            runtime.globals().http_response = '{not valid json'
            runtime.globals().confirm_answer = 'ok'
            self.patch_network_channel(runtime, channel_dir)
            self.assertEqual(len(runtime.globals().confirms), 1)

    def test_both_channels_unreachable_is_reported_clearly(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            channel_dir = Path(temp) / 'does-not-exist'
            runtime = self.setup(plugin_dir, local_version='v0.21.0 (build 0034)')
            runtime.globals().http_response = False
            self.patch_network_channel(runtime, channel_dir)
            body = runtime.globals().messages[1]['body']
            self.assertIn('build 0034', body)
            self.assertIn('Nao foi possivel conectar', body.replace('ã', 'a'))
            self.assertEqual(len(runtime.globals().confirms), 0)
            self.assertEqual(len(runtime.globals().revealed), 0)

    def test_declining_the_offer_does_not_reveal_anything(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            runtime = self.setup(plugin_dir, local_version='v0.21.0 (build 0034)')
            runtime.globals().http_response = json.dumps({'version': 'v0.22.0 (build 0040)', 'build': 40})
            runtime.globals().confirm_answer = 'cancel'
            self.patch_network_channel(runtime, Path(temp) / 'unused-network-channel')
            self.assertEqual(len(runtime.globals().revealed), 0)

    def test_first_install_without_local_buildinfo_still_offers_the_update(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            runtime = self.setup(plugin_dir, local_version=None)
            runtime.globals().http_response = json.dumps({'version': 'v0.22.0 (build 0040)', 'build': 40})
            runtime.globals().confirm_answer = 'ok'
            self.patch_network_channel(runtime, Path(temp) / 'unused-network-channel')
            self.assertEqual(len(runtime.globals().revealed), 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
