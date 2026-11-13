"""Watched-folder automatic editing contracts (SDK doubles, not native Lightroom QA)."""
import json
import tempfile
import unittest
from pathlib import Path

import test_photo_editor_lua as editor_tests


class AutoEditLuaTests(unittest.TestCase):
    def test_partial_application_records_successes_and_never_retries_failed_photo(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup(Path(temp))
            runtime.execute('''
                broken=newImport(10);good=newImport(11)
                broken.applyDevelopSettings=function(self,s)
                    applyCount=applyCount+1;self.settings.Exposure2012=s.Exposure2012;error('SDK fixture failure')
                end
            ''')
            self.assertEqual(self.ticks(runtime, 3)[-1], 'COMPLETED_WITH_ERRORS')
            state = runtime.globals().auto.load()
            self.assertTrue(state.processed['11'])
            self.assertIsNone(state.processed['10'])
            self.assertEqual(state.skipped['10'], 'NOT_CONFIRMED')
            self.assertEqual(runtime.globals().applyCount, 2)
            self.assertEqual(self.ticks(runtime, 3), ['WAITING'] * 3)
            self.assertEqual(runtime.globals().applyCount, 2)

    def setup(self, folder):
        helper = editor_tests.PhotoEditorLuaTests()
        runtime = helper.setup_editor(folder)
        self.helper = helper
        runtime.execute('''
            modules.LrDate.timeToUserFormat=function() return '2026-11-07 120000' end
            modules.LrPathUtils.leafName=function(p) return p:match('([^/]+)$') end
            modules.LrPathUtils.parent=function(p) return p:match('^(.*)/[^/]+$') end
            modules.LrDialogs.showBezel=function(text) bezel=text end
            folderPhotos={source}
            watchedFolder={getPhotos=function() return folderPhotos end}
            catalog.getFolderByPath=function(self,p) if p=='D:/fotos' then return watchedFolder end end
            catalog.getAllPhotos=function() return masters end
            collections={}
            catalog.createCollection=function(self,name,parent,existing)
                assert(inGate);local c=collections[name] or {name=name,photos={},addPhotos=function(self,photos) assert(inGate);for _,p in ipairs(photos) do self.photos[#self.photos+1]=p end end}
                collections[name]=c;return c
            end
            function inPlace(p) p.applyDevelopSettings=function(self,s,history) assert(inGate);applyCount=applyCount+1;for k,v in pairs(s) do self.settings[k]=clone(v) end end;return p end
            function newImport(id,path) local p=inPlace(newMaster(id));if path then p.path=path end;masters[#masters+1]=p;folderPhotos[#folderPhotos+1]=p;return p end
            auto=dofile(plugin_path..'/AutoEdit.lua')
            watch=auto.enable(catalog,'D:/fotos')
        ''')
        return runtime

    def ticks(self, runtime, count):
        return [runtime.eval('auto.tick()') for _ in range(count)]

    def test_new_import_is_edited_in_place_after_import_settles_without_touching_selection(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup(Path(temp))
            before = runtime.globals().editor.fingerprint(runtime.globals().source.settings)
            runtime.execute('imported=newImport(10)')
            self.assertEqual(self.ticks(runtime, 3), ['IMPORT_IN_PROGRESS', 'WAITING', 'COMPLETED'])
            g = runtime.globals()
            self.assertEqual(g.imported.settings.Exposure2012, .23)
            self.assertEqual(g.editor.fingerprint(g.source.settings), before)
            self.assertEqual((g.createCount, g.moduleName, g.selected[1].localIdentifier), (0, 'library', 1))
            collection = g.collections['Auto 2026-11-07 120000 - fotos']
            self.assertEqual(collection.photos[1].localIdentifier, 10)
            state = g.auto.load()
            self.assertTrue(state.processed['10'])
            self.assertIn('1 fotos', g.bezel)
            self.assertEqual(self.ticks(runtime, 1), ['WAITING'])
            self.assertEqual(g.applyCount, 1)
            session = json.loads((Path(g.prefs.lastEditSession) / 'session.json').read_text())
            self.assertTrue(session['automatic']);self.assertEqual(session['mode'], 'IN_PLACE')
            restored, skipped, _ = g.editor.restoreSession(g.prefs.lastEditSession)
            self.assertEqual((restored, skipped), (1, 0))

    def test_photo_changed_before_automatic_edit_is_preserved_forever(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup(Path(temp))
            runtime.execute('imported=newImport(11)')
            self.ticks(runtime, 2)
            runtime.execute('imported.settings.Exposure2012=1')
            self.assertEqual(self.ticks(runtime, 3), ['WAITING', 'WAITING', 'WAITING'])
            g = runtime.globals()
            self.assertEqual((g.imported.settings.Exposure2012, g.applyCount), (1, 0))
            self.assertEqual(g.auto.load().skipped['11'], 'CHANGED_BEFORE_AUTOMATIC_EDIT')

    def test_existing_moved_virtual_and_non_raw_photos_are_never_edited(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup(Path(temp))
            runtime.execute('''
                folderPhotos[#folderPhotos+1]=inPlace(other)
                jpeg=newImport(12,'D:/fotos/12.JPG')
                v=newImport(13);v.isCopy=true;v.master=source
            ''')
            self.ticks(runtime, 4)
            g = runtime.globals();state = g.auto.load()
            self.assertEqual(g.applyCount, 0)
            self.assertEqual((state.skipped['12'], state.skipped['13']), ('NOT_CR3', 'VIRTUAL_COPY'))
            self.assertIsNone(state.skipped['2'])

    def test_busy_paused_or_other_catalog_does_nothing(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup(Path(temp))
            runtime.execute('newImport(14);MizinEngineBusy=true')
            self.assertEqual(self.ticks(runtime, 3), ['IDLE'] * 3)
            runtime.execute("MizinEngineBusy=false;catalog.getPath=function() return 'D:/outro.lrcat' end")
            self.assertEqual(self.ticks(runtime, 3), ['OTHER_CATALOG'] * 3)
            runtime.execute("catalog.getPath=function() return 'D:/catalog.lrcat' end;local s=auto.load();s.paused=true;auto.save(s)")
            self.assertEqual(self.ticks(runtime, 3), ['IDLE'] * 3)
            self.assertEqual(runtime.globals().applyCount, 0)

    def test_engine_error_pauses_instead_of_retrying_every_minute(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup(Path(temp))
            runtime.globals().invalid_prediction = True
            runtime.execute('imported=newImport(15)')
            self.assertEqual(self.ticks(runtime, 4), ['IMPORT_IN_PROGRESS', 'WAITING', 'PAUSED_AFTER_ERROR', 'IDLE'])
            g = runtime.globals();state = g.auto.load()
            self.assertTrue(state.paused);self.assertIn('Sugestao invalida', state.lastError)
            self.assertEqual((g.applyCount, g.MizinEditorBusy), (0, False))
            self.assertIn('PAUSADA', g.auto.describe(state))

    def test_loop_generation_stops_old_loops(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup(Path(temp))
            runtime.execute('''
                sleeps=0;modules.LrTasks.sleep=function() sleeps=sleeps+1;if sleeps>=3 then auto.stopLoop() end end
                auto.startLoop()
            ''')
            self.assertEqual(runtime.globals().sleeps, 3)


if __name__ == '__main__':
    unittest.main(verbosity=2)
