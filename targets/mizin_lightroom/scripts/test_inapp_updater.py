"""Unit tests for InApp-UpdatePlugin.py (download + validate + extract to STAGING only;
it must never write into an installed plugin directory -- see the module docstring for
why: that directory's own Runtime/pythonw.exe is what runs this script)."""
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

SCRIPTS = Path(__file__).resolve().parent

import sys
sys.path.insert(0, str(SCRIPTS))
from importlib import import_module
InAppModule = import_module("InApp-UpdatePlugin")
write_progress = InAppModule.write_progress
stage_update = InAppModule.stage_update


class InAppUpdaterTests(unittest.TestCase):
    def test_write_progress_creates_valid_json(self):
        with tempfile.TemporaryDirectory() as temp:
            prog_file = Path(temp) / "progress.json"
            write_progress(prog_file, "downloading", 0.45, "Baixando 45%...")
            self.assertTrue(prog_file.is_file())
            data = json.loads(prog_file.read_text(encoding="utf-8"))
            self.assertEqual(data["stage"], "downloading")
            self.assertEqual(data["percent"], 0.45)
            self.assertEqual(data["message"], "Baixando 45%...")
            self.assertIn("timestamp", data)

    def test_write_progress_merges_extra_fields(self):
        with tempfile.TemporaryDirectory() as temp:
            prog_file = Path(temp) / "progress.json"
            write_progress(prog_file, "staged", 1.0, "Pronto", extra={"stagedPluginPath": "C:/x"})
            data = json.loads(prog_file.read_text(encoding="utf-8"))
            self.assertEqual(data["stagedPluginPath"], "C:/x")

    def test_stage_update_extracts_into_staging_without_touching_any_plugin_dir(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            # A directory that LOOKS like an installed plugin, to prove stage_update
            # never writes into anything resembling one -- it only takes a staging root.
            decoy_plugin_dir = root / "CRISPIX.lrplugin"
            decoy_plugin_dir.mkdir()
            (decoy_plugin_dir / "old_code.lua").write_text("old code", encoding="utf-8")

            archive_path = root / "update.zip"
            new_version = "v0.2.0 (build 0044)"
            with zipfile.ZipFile(archive_path, "w") as zf:
                zf.writestr("CRISPIX.lrplugin/BuildInfo.json", json.dumps({"version": new_version}))
                zf.writestr("CRISPIX.lrplugin/Info.lua", "return {}")
                zf.writestr("CRISPIX.lrplugin/new_code.lua", "new code content")

            staging_root = root / "staging"
            prog_file = root / "progress.json"
            staged_plugin = stage_update(archive_path, staging_root, prog_file, expected_version=new_version)

            # Staged folder has the new files...
            self.assertTrue((staged_plugin / "new_code.lua").is_file())
            self.assertTrue((staged_plugin / "Info.lua").is_file())
            # ...and the decoy "installed" directory was never touched.
            self.assertEqual((decoy_plugin_dir / "old_code.lua").read_text(encoding="utf-8"), "old code")
            self.assertFalse((decoy_plugin_dir / "new_code.lua").exists())

    def test_stage_update_rejects_version_mismatch(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive_path = root / "update.zip"
            with zipfile.ZipFile(archive_path, "w") as zf:
                zf.writestr("CRISPIX.lrplugin/BuildInfo.json", json.dumps({"version": "v0.1.0 (build 0001)"}))
                zf.writestr("CRISPIX.lrplugin/Info.lua", "return {}")
            with self.assertRaises(ValueError):
                stage_update(archive_path, root / "staging", root / "progress.json",
                             expected_version="v0.2.0 (build 0002)")

    def test_stage_update_rejects_package_without_info_lua(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive_path = root / "update.zip"
            with zipfile.ZipFile(archive_path, "w") as zf:
                zf.writestr("CRISPIX.lrplugin/BuildInfo.json", json.dumps({"version": "v0.1.0 (build 0001)"}))
            with self.assertRaises(ValueError):
                stage_update(archive_path, root / "staging", root / "progress.json")


if __name__ == "__main__":
    unittest.main(verbosity=2)
