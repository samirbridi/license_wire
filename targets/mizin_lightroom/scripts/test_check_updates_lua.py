"""Contract tests for CheckUpdates.lua: offer with visual identity -> native progress
dialog while Lightroom stays open (download+validate+extract to a TEMP staging folder
only) -> honest "Lightroom will close now" notice -> handoff to the already-proven
Update-CrispixPlugin.ps1 (via Launch-CrispixUpdate.py -PrestagedArchive) which closes
Lightroom, backs up, swaps files and reopens. The post-restart "update complete" window
is tested separately in test_learning_init_lua.py, since it only makes sense to show
after the new plugin has actually loaded."""
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

    def test_internet_reachable_and_up_to_date_shows_visual_modal(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            runtime = self.setup(plugin_dir, local_version='v0.22.0 (build 0035)')
            runtime.globals().http_response = json.dumps({'version': 'v0.22.0 (build 0035)', 'build': 35})
            self.patch_network_channel(runtime, Path(temp) / 'unused-network-channel')
            self.assertEqual(list(runtime.globals().httpCalls.values()), [REAL_INTERNET_URL])
            self.assertEqual(len(runtime.globals().modals), 1)
            modal = runtime.globals().modals[1]
            self.assertIn('Atualizacoes', modal['title'])
            self.assertEqual(modal['actionVerb'], 'OK')

    def test_internet_offers_update_stages_successfully_and_hands_off_to_installer(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            runtime = self.setup(plugin_dir, local_version='v0.21.0 (build 0034)')
            runtime.globals().http_response = json.dumps({
                'version': 'v0.22.0 (build 0040)', 'build': 40,
                'archiveSha256': 'a' * 64,
                'downloadUrl': 'https://crispixlr.pages.dev/x.zip'
            })
            runtime.globals().modal_answer = 'ok'

            temp_dir = Path(temp) / 'temp_dir'
            temp_dir.mkdir()
            runtime.globals().mock_temp_dir = temp_dir.as_posix()
            # Simulate the stager (InApp-UpdatePlugin.py via Launch-InAppUpdate.py)
            # reporting a successful stage; the Lua mock's Tasks.execute writes this
            # the moment it sees the staging launch command, before polling begins.
            runtime.globals().stage_result = json.dumps({
                'stage': 'staged', 'percent': 1.0, 'message': 'Pronto',
                'stagedPluginPath': (temp_dir / 'CRISPIX.lrplugin').as_posix(),
                'stagedArchivePath': (temp_dir / 'x.zip').as_posix(),
            })

            self.patch_network_channel(runtime, Path(temp) / 'unused-network-channel')

            offer = runtime.globals().modals[1]
            self.assertIn('Disponivel', offer['title'])
            self.assertEqual(offer['actionVerb'], 'Atualizar agora')

            # Progress dialog shown during staging (Lightroom stays open).
            self.assertEqual(len(runtime.globals().progressDialogs), 1)
            self.assertIn('Baixando', runtime.globals().progressDialogs[1]['title'])

            # Honest "closing now" notice, not a false "already done" claim.
            closing = runtime.globals().modals[2]
            self.assertIn('Instalando', closing['title'])

            # Handoff command references the prestaged archive and Launch-CrispixUpdate.py
            # (the proven installer path), not a direct write into the plugin directory.
            self.assertEqual(len(runtime.globals().revealed), 1)
            handoff_cmd = runtime.globals().revealed[1]
            self.assertIn('Launch-CrispixUpdate.py', handoff_cmd)
            self.assertIn('--prestaged-archive', handoff_cmd)
            self.assertIn('--prestaged-sha256', handoff_cmd)

            # Marker for LearningInit.lua to show the post-restart welcome window.
            marker = Path(temp_dir) / 'MizinLightroomLocal' / 'pending-update-notice.json'
            self.assertTrue(marker.is_file())
            info = json.loads(marker.read_text(encoding='utf-8'))
            self.assertEqual(info['toVersion'], 'v0.22.0 (build 0040)')

    def test_staging_failure_reports_error_and_never_hands_off(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            runtime = self.setup(plugin_dir, local_version='v0.21.0 (build 0034)')
            runtime.globals().http_response = json.dumps({
                'version': 'v0.22.0 (build 0040)', 'build': 40,
                'archiveSha256': 'a' * 64,
                'downloadUrl': 'https://crispixlr.pages.dev/x.zip'
            })
            runtime.globals().modal_answer = 'ok'
            temp_dir = Path(temp) / 'temp_dir'
            temp_dir.mkdir()
            runtime.globals().mock_temp_dir = temp_dir.as_posix()
            runtime.globals().stage_result = json.dumps({
                'stage': 'error', 'percent': 0.0, 'message': 'Hash SHA-256 divergente!',
            })
            self.patch_network_channel(runtime, Path(temp) / 'unused-network-channel')
            # Only the offer modal; no "closing now" modal, no handoff.
            self.assertEqual(len(runtime.globals().modals), 1)
            self.assertEqual(len(runtime.globals().revealed), 0)
            self.assertIn('Falha', runtime.globals().messages[1]['title'])
            self.assertIn('Hash SHA-256', runtime.globals().messages[1]['body'])

    def test_missing_download_url_refuses_instead_of_crashing(self):
        # Network-share channel manifests have no downloadUrl; the in-app path needs one.
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            channel_dir = Path(temp) / 'channel'
            channel_dir.mkdir(parents=True)
            (channel_dir / 'latest.json').write_text(
                json.dumps({'version': 'v0.22.0 (build 0040)', 'build': 40, 'archiveSha256': 'a' * 64}),
                encoding='utf-8')
            runtime = self.setup(plugin_dir, local_version='v0.21.0 (build 0034)')
            runtime.globals().http_response = False
            runtime.globals().modal_answer = 'ok'
            self.patch_network_channel(runtime, channel_dir)
            self.assertEqual(len(runtime.globals().progressDialogs), 0)
            self.assertEqual(len(runtime.globals().revealed), 0)
            self.assertIn('rede local', runtime.globals().messages[1]['body'])

    def test_declining_the_update_does_not_stage_or_launch(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            runtime = self.setup(plugin_dir, local_version='v0.21.0 (build 0034)')
            runtime.globals().http_response = json.dumps({
                'version': 'v0.22.0 (build 0040)', 'build': 40,
                'archiveSha256': 'a' * 64,
                'downloadUrl': 'https://crispixlr.pages.dev/x.zip'
            })
            runtime.globals().modal_answer = 'cancel'
            self.patch_network_channel(runtime, Path(temp) / 'unused-network-channel')
            self.assertEqual(len(runtime.globals().modals), 1)
            self.assertEqual(len(runtime.globals().progressDialogs), 0)
            self.assertEqual(len(runtime.globals().revealed), 0)

    def test_internet_manifest_with_utf8_bom_is_still_read(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            runtime = self.setup(plugin_dir, local_version='v0.23.0 (build 0036)')
            manifest = json.dumps({'version': 'v0.24.0 (build 0037)', 'build': '0037',
                                   'downloadUrl': 'https://example.invalid/x.zip'})
            runtime.globals().http_response = b'\xef\xbb\xbf' + manifest.encode('utf-8')
            runtime.globals().modal_answer = 'cancel'
            self.patch_network_channel(runtime, Path(temp) / 'unused-network-channel')
            self.assertEqual(len(runtime.globals().modals), 1)
            self.assertIn('Disponivel', runtime.globals().modals[1]['title'])

    def test_internet_down_falls_back_to_network_share(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            channel_dir = Path(temp) / 'channel'
            channel_dir.mkdir(parents=True)
            (channel_dir / 'latest.json').write_text(
                json.dumps({'version': 'v0.22.0 (build 0040)', 'build': 40}), encoding='utf-8')
            runtime = self.setup(plugin_dir, local_version='v0.21.0 (build 0034)')
            runtime.globals().http_response = False
            runtime.globals().modal_answer = 'cancel'
            self.patch_network_channel(runtime, channel_dir)
            self.assertEqual(list(runtime.globals().httpCalls.values()), [REAL_INTERNET_URL])
            self.assertEqual(len(runtime.globals().modals), 1)
            self.assertIn('Disponivel', runtime.globals().modals[1]['title'])

    def test_both_channels_unreachable_shows_visual_notice(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin_dir = Path(temp) / 'plugin'
            channel_dir = Path(temp) / 'does-not-exist'
            runtime = self.setup(plugin_dir, local_version='v0.21.0 (build 0034)')
            runtime.globals().http_response = False
            self.patch_network_channel(runtime, channel_dir)
            self.assertEqual(len(runtime.globals().modals), 1)
            self.assertIn('Atualizacoes', runtime.globals().modals[1]['title'])

    def setup(self, plugin_dir, local_version=None):
        plugin_dir.mkdir(parents=True, exist_ok=True)
        (plugin_dir / 'Json.lua').write_text((LUA / 'Json.lua').read_text(encoding='utf-8'), encoding='utf-8')
        if local_version is not None:
            (plugin_dir / 'BuildInfo.json').write_text(
                json.dumps({'version': local_version}), encoding='utf-8')
        runtime = LuaRuntime(unpack_returned_tuples=True)
        runtime.globals().plugin_path = plugin_dir.as_posix()
        runtime.execute('''
            messages, modals, progressDialogs, revealed, httpCalls = {}, {}, {}, {}, {}

            local viewFactory = {
                control_spacing = function() return 8 end,
                row = function(t) return t end,
                column = function(t) return t end,
                group_box = function(t) return t end,
                spacer = function(t) return t end,
                picture = function(t) return t end,
                static_text = function(t) return t end,
                push_button = function(t) return t end,
            }

            modules = {
                LrApplication = {},
                LrDialogs = {
                    message = function(title, body, kind) messages[#messages+1] = {title=title, body=body, kind=kind} end,
                    presentModalDialog = function(opts)
                        modals[#modals+1] = opts
                        return modal_answer or 'cancel'
                    end,
                    showModalProgressDialog = function(opts)
                        progressDialogs[#progressDialogs+1] = opts
                        return {
                            setPortionComplete = function() end,
                            setCaption = function() end,
                        }
                    end,
                },
                LrView = {
                    defaultFactory = function() return viewFactory end,
                },
                LrFileUtils = {
                    exists = function(p)
                        local f = io.open(p, 'rb')
                        if f then f:close(); return true end
                        return false
                    end,
                    delete = function(p) os.remove(p) end,
                    createAllDirectories = function(p)
                        os.execute('mkdir "' .. p:gsub('/', '\\\\') .. '" 2>nul')
                    end,
                },
                LrFunctionContext = {
                    callWithContext = function(name, fn)
                        return fn({})
                    end,
                },
                LrHttp = {
                    get = function(url, headers, timeout)
                        httpCalls[#httpCalls+1] = url
                        if http_response == false then return nil end
                        return http_response or nil
                    end,
                },
                LrPathUtils = {
                    child = function(p, n) return p .. '/' .. n end,
                    getStandardFilePath = function(name)
                        return mock_temp_dir or '/tmp'
                    end,
                },
                LrShell = { revealInShell = function(path) revealed[#revealed+1] = path end },
                LrTasks = {
                    pcall = pcall,
                    sleep = function() end,
                    startAsyncTask = function(fn) fn() end,
                    execute = function(command)
                        -- Distinguish the staging launch (writes stage_result to the
                        -- progress file before CheckUpdates.lua starts polling it) from
                        -- the final handoff to Launch-CrispixUpdate.py (just recorded).
                        if command:find('Launch%-InAppUpdate') and mock_temp_dir then
                            local p = mock_temp_dir .. '/crispix_update_progress.json'
                            local f = io.open(p, 'wb')
                            if f then
                                f:write(stage_result or '{"stage":"staged","percent":1.0,"message":"Pronto","stagedPluginPath":"x","stagedArchivePath":"y"}')
                                f:close()
                            end
                        else
                            revealed[#revealed+1] = command
                        end
                        return launchCode or 0
                    end,
                },
            }
            import = function(name) assert(modules[name], name); return modules[name] end
            _PLUGIN = { path = plugin_path }
        ''')
        return runtime

    def patch_network_channel(self, runtime, channel_dir):
        source = (LUA / 'CheckUpdates.lua').read_text(encoding='utf-8')
        self.assertIn(REAL_NETWORK_CHANNEL, source)
        self.assertIn(REAL_INTERNET_URL, source)
        patched = source.replace(REAL_NETWORK_CHANNEL, channel_dir.as_posix())
        runtime.execute(patched)


if __name__ == '__main__':
    unittest.main(verbosity=2)
