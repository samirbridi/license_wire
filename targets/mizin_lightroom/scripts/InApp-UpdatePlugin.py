"""In-App Plugin Updater for CRISPIX (Lightroom Classic).

Downloads, validates (SHA-256) and extracts the update package into a TEMP STAGING
folder only. It never writes into the installed plugin directory: that folder's own
Runtime/pythonw.exe is what runs this very script, and Windows cannot replace a DLL
(python313.dll etc.) that is loaded in the running process (confirmed 2026-11-16:
copying over Runtime/python313.dll from this same interpreter raises PermissionError
mid-copy, leaving the plugin a mix of old and new files with no backup).

The actual swap into the plugin directory is done by Update-CrispixPlugin.ps1, which
closes Lightroom first (so Runtime/ is free to replace) and already has a tested
backup/rollback path. This script's job ends at 'staged': CheckUpdates.lua then hands
the staged, already-validated archive to that script via -PrestagedArchive so it does
not need to download it again.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time
import urllib.request
import zipfile


def write_progress(progress_file: Path, stage: str, percent: float, message: str, extra: dict = None):
    try:
        temp = progress_file.with_name(f"{progress_file.name}.tmp-{os.getpid()}")
        data = {
            "stage": stage,
            "percent": round(max(0.0, min(1.0, percent)), 3),
            "message": message,
            "timestamp": time.time(),
        }
        if extra:
            data.update(extra)
        with temp.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, progress_file)
    except Exception:
        pass


def download_with_progress(url: str, dest: Path, progress_file: Path, expected_sha256: str = None) -> bool:
    write_progress(progress_file, "downloading", 0.05, "Conectando ao servidor...")
    req = urllib.request.Request(url, headers={"User-Agent": "CRISPIX-Plugin-Updater/1.0"})

    with urllib.request.urlopen(req, timeout=30) as response:
        total_size = int(response.headers.get("Content-Length", 0))
        downloaded = 0
        hasher = hashlib.sha256()
        block_size = 64 * 1024
        last_update = time.monotonic()

        with dest.open("wb") as out:
            while True:
                chunk = response.read(block_size)
                if not chunk:
                    break
                out.write(chunk)
                hasher.update(chunk)
                downloaded += len(chunk)

                now = time.monotonic()
                if now - last_update >= 0.15 or (total_size and downloaded >= total_size):
                    last_update = now
                    if total_size > 0:
                        fraction = downloaded / total_size
                        # Download represents 0.05 to 0.65 of total staging progress.
                        progress_val = 0.05 + fraction * 0.60
                        mb_done = downloaded / (1024 * 1024)
                        mb_total = total_size / (1024 * 1024)
                        write_progress(progress_file, "downloading", progress_val,
                                       f"Baixando pacote... {mb_done:.1f} MB / {mb_total:.1f} MB ({int(fraction * 100)}%)")
                    else:
                        mb_done = downloaded / (1024 * 1024)
                        write_progress(progress_file, "downloading", 0.35, f"Baixando pacote... {mb_done:.1f} MB")

    if expected_sha256:
        write_progress(progress_file, "validating", 0.68, "Validando integridade do download (SHA-256)...")
        computed = hasher.hexdigest().lower()
        if computed != expected_sha256.lower():
            raise ValueError(f"Hash SHA-256 divergente! Esperado: {expected_sha256}, Calculado: {computed}")

    return True


def stage_update(archive_path: Path, staging_root: Path, progress_file: Path, expected_version: str = None) -> Path:
    """Extracts and validates the package into staging_root. Never touches the installed
    plugin. Returns the path to the validated *.lrplugin folder inside staging_root."""
    write_progress(progress_file, "extracting", 0.72, "Extraindo pacote de atualização...")

    staging_root.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path, "r") as zf:
        zf.extractall(staging_root)

    lrplugins = list(staging_root.glob("*.lrplugin"))
    if not lrplugins:
        lrplugins = list(staging_root.rglob("*.lrplugin"))
    if not lrplugins:
        raise ValueError("O pacote baixado não contém uma pasta *.lrplugin válida.")

    staged_plugin = lrplugins[0]

    write_progress(progress_file, "validating", 0.85, "Validando versão do pacote extraído...")
    build_info_path = staged_plugin / "BuildInfo.json"
    if build_info_path.is_file() and expected_version:
        with build_info_path.open("r", encoding="utf-8") as f:
            info = json.load(f)
        if info.get("version") != expected_version:
            raise ValueError(f"Versão no pacote ({info.get('version')}) diferente do manifesto ({expected_version}).")
    if not (staged_plugin / "Info.lua").is_file():
        raise ValueError("Pacote extraído não contém Info.lua; instalação abortada.")

    return staged_plugin


def main():
    parser = argparse.ArgumentParser(description="CRISPIX In-App Update Stager (download + validate + extract only)")
    parser.add_argument("--download-url", required=True, type=str, help="URL de download do pacote .zip")
    parser.add_argument("--sha256", required=True, type=str, help="SHA-256 esperado do pacote")
    parser.add_argument("--version", required=False, type=str, help="Versão esperada")
    parser.add_argument("--progress-file", required=True, type=Path, help="Arquivo JSON de progresso")
    parser.add_argument("--staging-dir", required=True, type=Path,
                        help="Pasta temporária de staging (fora da instalação do plugin)")

    args = parser.parse_args()
    progress_file = args.progress_file.resolve()
    staging_dir = args.staging_dir.resolve()

    temp_zip = Path(tempfile.mktemp(prefix="crispix-download-", suffix=".zip"))
    try:
        download_with_progress(args.download_url, temp_zip, progress_file, args.sha256)
        staged_plugin = stage_update(temp_zip, staging_dir, progress_file, args.version)
        # Keep the validated archive alongside the staged folder: Update-CrispixPlugin.ps1
        # re-validates its own hash before touching anything, so handing it the already
        # verified zip (instead of re-downloading) costs nothing in trust, only time.
        staged_archive = staging_dir / temp_zip.name
        shutil.copy2(temp_zip, staged_archive)
        write_progress(progress_file, "staged", 1.0,
                       "Pacote baixado e validado. Pronto para instalar.",
                       extra={"stagedPluginPath": str(staged_plugin), "stagedArchivePath": str(staged_archive)})
    except Exception as e:
        write_progress(progress_file, "error", 0.0, f"Falha na atualização: {e}")
        sys.exit(1)
    finally:
        if temp_zip.is_file():
            try:
                temp_zip.unlink()
            except Exception:
                pass


if __name__ == "__main__":
    main()
