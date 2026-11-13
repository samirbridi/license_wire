"""Regression of the reported first-photo crop failure, using Lua 5.1 SDK doubles."""
import json
from pathlib import Path
import tempfile
import unittest

import test_photo_editor_lua as editor_tests


class BatchRecoveryTests(unittest.TestCase):
    def setup(self, folder, count, in_place):
        helper = editor_tests.PhotoEditorLuaTests()
        runtime = helper.setup_editor(folder)
        runtime.globals().photo_count = count
        runtime.globals().direct = in_place
        runtime.execute('''
            masters={};selected={}
            for i=1,photo_count do
                local p=newMaster(i)
                p.settings.CropAngle=0;p.settings.CropTop=0;p.settings.CropLeft=0
                p.settings.CropBottom=1;p.settings.CropRight=1;p.settings.HasCrop=nil
                p.applyDevelopSettings=function(self,settings)
                    assert(inGate);applyCount=applyCount+1
                    for key,value in pairs(settings) do
                        if key~='HasCrop' then self.settings[key]=clone(value) end
                    end
                    local id=self.isCopy and self.master.localIdentifier or self.localIdentifier
                    if id==fail_id then self.settings.CropTop=.25 end
                    if delayed then
                        self.pending=clone(self.settings);self.settings.Exposure2012=-1
                    end
                end
                masters[i]=p;selected[i]=p
            end
            source=masters[1]
            sleeps=0
            modules.LrTasks.sleep=function()
                sleeps=sleeps+1
                for _,p in ipairs(masters) do
                    if p.pending then p.settings=p.pending;p.pending=nil end
                    for _,c in ipairs(p.copies) do
                        if c.pending then c.settings=c.pending;c.pending=nil end
                    end
                end
            end
        ''')
        directory = helper.plan(runtime, folder, use_base=False)
        runtime.execute('''
            if direct then manifest.mode='IN_PLACE' end
            for _,record in ipairs(manifest.photos) do
                editor.horizon(record.settings,source.settings,{status='PROPOSAL_ONLY',imageSlopeDegrees=2,
                    imageWidth=1024,imageHeight=683,sensorSwapped=false})
                record.horizon={cropAngle=2}
                -- Old sessions contain the XMP flag; even these must not require readback.
                record.settings.HasCrop=true
            end
        ''')
        (directory / 'session.json').write_text(runtime.globals().codec.encode(runtime.globals().manifest))
        return helper, runtime, directory

    def apply(self, runtime, directory, direct):
        g = runtime.globals()
        return (g.editor.applyInPlace if direct else g.editor.applyPlan)(g.catalog, directory.as_posix(), g.manifest, g.progress)

    def test_first_and_middle_crop_failure_do_not_stop_105_photos_and_restore(self):
        for direct in (True, False):
            for fail_id in (1, 53):
                with self.subTest(direct=direct, fail_id=fail_id), tempfile.TemporaryDirectory() as temp:
                    _, runtime, directory = self.setup(Path(temp), 105, direct)
                    runtime.globals().fail_id = fail_id
                    status, _, _ = self.apply(runtime, directory, direct)
                    g = runtime.globals()
                    self.assertEqual(status, 'COMPLETED_WITH_ERRORS')
                    self.assertEqual((g.manifest.application.completed, g.manifest.application.failed), (104, 1))
                    self.assertEqual(g.manifest.application.straightened, 104)
                    self.assertEqual(g.applyCount, 105)
                    self.assertTrue((directory / '105-applied.json').is_file())
                    failed = json.loads((directory / f'{fail_id:03d}-failed.json').read_text())
                    self.assertIn('CropTop', failed['error'])
                    self.assertNotIn('HasCrop', failed['error'])
                    runtime.globals().fail_id = None
                    # Restore in-place uses exact saved controls; no absent-field defaults here.
                    restored, skipped, _ = g.editor.restoreSession(directory.as_posix())
                    self.assertEqual((restored, skipped), (105, 0))

    def test_missing_has_crop_and_delayed_host_readback_are_accepted(self):
        for direct in (True, False):
            with self.subTest(direct=direct), tempfile.TemporaryDirectory() as temp:
                _, runtime, directory = self.setup(Path(temp), 15, direct)
                runtime.globals().delayed = True
                self.assertEqual(self.apply(runtime, directory, direct)[0], 'COMPLETED')
                self.assertEqual(runtime.globals().manifest.application.straightened, 15)
                self.assertEqual(runtime.globals().sleeps, 15)

    def test_full_entry_counts_only_confirmed_straightening_and_keeps_failure_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            _, runtime, _ = self.setup(Path(temp), 15, True)
            runtime.execute("prefs.editOptions={horizon=true};fail_id=1;modules.LrDialogs.confirm=function() return 'ok' end")
            session = Path(runtime.globals().editor.edit(True))
            outcome = json.loads((session / 'outcome.json').read_text())
            self.assertEqual(outcome['status'], 'COMPLETED_WITH_ERRORS')
            self.assertEqual(outcome['application']['straightened'], 14)
            self.assertEqual(outcome['application']['failed'], 1)
            self.assertFalse(runtime.globals().MizinEditorBusy)

    def test_cancel_after_failed_photo_does_not_apply_remaining_photos(self):
        with tempfile.TemporaryDirectory() as temp:
            _, runtime, directory = self.setup(Path(temp), 15, True)
            runtime.execute('fail_id=1;cancelAt=1')
            self.assertEqual(self.apply(runtime, directory, True)[0], 'CANCELLED')
            self.assertEqual(runtime.globals().applyCount, 1)
            self.assertFalse((directory / '002-ready.json').exists())
