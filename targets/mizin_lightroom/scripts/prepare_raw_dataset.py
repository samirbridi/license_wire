"""Read-only CR3 acquisition, metadata pairing and local technical input renders.

The LibRaw renders are input-domain data, not Lightroom exports or edited targets.
All individual records and pixels stay under private/. No upload APIs are used.
"""
from __future__ import annotations

import argparse
import ctypes
import datetime as dt
import hashlib
import json
import math
import ntpath
import os
import re
import subprocess
import time
import uuid
from pathlib import Path, PureWindowsPath

from raw_features import sha256_file, source_reader, technical_render

TARGET = Path(__file__).resolve().parents[1]
METADATA_TAGS = ["-FileName", "-FileSize#", "-FileType", "-EXIF:Model", "-EXIF:DateTimeOriginal",
                 "-SubSecDateTimeOriginal", "-ImageWidth", "-ImageHeight", "-ISO", "-ExposureTime#",
                 "-FNumber", "-FocalLength#"]
CAPTURE = re.compile(r"^(\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2})(?:\.(\d+))?([+-]\d{2}:\d{2}|Z)?$")




def load_references(manifest, event_root, original_root):
    root = PureWindowsPath(original_root)
    records = []
    names = set()
    physical_ids = set()
    with Path(manifest).open(encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            if row["eventRootId"] != event_root:
                continue
            if not row["technicalCandidate"] or row["approvalStatus"] != "REFERENCE_APPROVED_BY_PHOTOGRAPHER":
                raise ValueError("Selected event contains an ineligible or unapproved reference")
            relative = PureWindowsPath(row["sourcePath"]).relative_to(root)
            if relative.is_absolute() or any(part in ("..", ".") for part in relative.parts) or any(c in str(relative) for c in "\r\n\x00"):
                raise ValueError("Unsafe source mapping")
            if relative.suffix.lower() != ".cr3":
                raise ValueError("This acquisition pipeline expects CR3 references")
            if str(relative).lower() in names or row["physicalFileId"] in physical_ids:
                raise ValueError("Duplicate physical file or relative name in selected references")
            names.add(str(relative).lower())
            physical_ids.add(row["physicalFileId"])
            row["sourceRelative"] = str(relative)
            records.append(row)
    if not records:
        raise ValueError("No approved references selected")
    return sorted(records, key=lambda r: (r["captureTime"], r["imageId"]))


def validate_pair(reference, metadata):
    if metadata.get("FileType") != "CR3":
        raise ValueError("Source is not identified as CR3")
    if metadata.get("FileName", "").lower() != PureWindowsPath(reference["sourceRelative"]).name.lower():
        raise ValueError("Filename does not match reference")
    if metadata.get("Model", "").strip() != reference["cameraModel"].strip():
        raise ValueError("Camera model does not match reference")
    actual_text = metadata.get("SubSecDateTimeOriginal") or metadata.get("DateTimeOriginal")
    match = CAPTURE.fullmatch(actual_text or "")
    if not match:
        raise ValueError("Missing or unsupported original capture time")
    actual = dt.datetime.strptime(match[1], "%Y:%m:%d %H:%M:%S")
    if match[2]:
        actual = actual.replace(microsecond=int((match[2] + "000000")[:6]))
    expected = dt.datetime.fromisoformat(reference["captureTime"])
    if expected.tzinfo is not None:
        raise ValueError("Catalog capture timezone needs an explicit mapping")
    # Compare stored camera wall-clock fields, not filesystem times or assumed UTC.
    if match[2]:
        if abs((actual - expected).total_seconds()) > 0.001:
            raise ValueError("Capture time does not match reference")
        precision = "SUBSECOND_WALL_CLOCK"
    else:
        if actual != expected.replace(microsecond=0):
            raise ValueError("Capture second does not match reference")
        precision = "SECOND_WALL_CLOCK_ONLY"
    if not isinstance(metadata.get("FileSize"), (int, float)) or metadata["FileSize"] <= 0:
        raise ValueError("Source size missing or invalid")
    return {"status": "METADATA_CONSISTENT", "cameraModel": metadata["Model"],
            "captureStored": reference["captureTime"], "captureExif": actual_text,
            "timePrecision": precision, "timezoneConverted": False,
            "catalogCryptographicIdentityAvailable": False}


def _read_metadata_chunk(paths, perl, exiftool, argument_path):
    with Path(argument_path).open("x", encoding="utf-8", newline="\n") as stream:
        stream.write("--\n")
        for path in paths:
            text = str(path).replace("\\", "/")
            if any(c in text for c in "\r\n\x00"):
                raise ValueError("Unsafe argument-file path")
            stream.write(text + "\n")
    command = [str(perl), str(exiftool).replace("\\", "/"), "-config", "", "-fast2", "-json", "-charset", "filename=UTF8",
               *METADATA_TAGS, "-@", str(argument_path).replace("\\", "/")]
    result = subprocess.run(command, capture_output=True, encoding="utf-8", errors="strict", timeout=180, check=False)
    if result.returncode != 0:
        raise RuntimeError("Metadata reader failed: " + result.stderr[:2000])
    rows = json.loads(result.stdout)
    if len(rows) != len(paths):
        raise ValueError("Metadata result count mismatch")
    by_path = {}
    for row in rows:
        if "Error" in row:
            raise ValueError("Metadata read error")
        key = ntpath.normcase(ntpath.normpath(row["SourceFile"]))
        if key in by_path:
            raise ValueError("Duplicate metadata result path")
        by_path[key] = row
    return [by_path[ntpath.normcase(ntpath.normpath(str(path)))] for path in paths]


def read_metadata(paths, perl, exiftool, argument_path):
    results = []
    argument_path = Path(argument_path)
    for offset in range(0, len(paths), 32):
        chunk_path = argument_path.with_name(argument_path.stem + f"-{offset//32:04}" + argument_path.suffix)
        results.extend(_read_metadata_chunk(paths[offset:offset+32], perl, exiftool, chunk_path))
        print(json.dumps({"phase": "METADATA", "scope": argument_path.stem,
                          "files": len(results), "total": len(paths)}), flush=True)
    return results




def copy_verified(source, destination, expected_bytes):
    source, destination = Path(source), Path(destination)
    before = source.stat()
    if before.st_size != expected_bytes:
        raise ValueError("Source size changed since metadata preflight")
    destination.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    copied = 0
    with source_reader(source) as reader, destination.open("xb") as writer:
        for block in iter(lambda: reader.read(4 * 1024 * 1024), b""):
            writer.write(block)
            digest.update(block)
            copied += len(block)
        writer.flush()
        os.fsync(writer.fileno())
        after = source.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise ValueError("Source changed during copy")
    actual = sha256_file(destination)
    if copied != expected_bytes or actual != digest.hexdigest():
        raise ValueError("Copied RAW does not match source-stream hash or size")
    os.utime(destination, ns=(before.st_atime_ns, before.st_mtime_ns))
    destination.chmod(0o444)
    return {"bytes": copied, "sha256": actual, "sourceStreamSha256": digest.hexdigest(),
            "sourceMetadataStable": True, "sourceWriteOperations": 0}




def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--event-root", type=int, required=True)
    parser.add_argument("--original-root", required=True)
    parser.add_argument("--share", required=True)
    parser.add_argument("--perl", type=Path, required=True)
    parser.add_argument("--exiftool", type=Path, required=True)
    args = parser.parse_args()
    share = PureWindowsPath(args.share)
    if share.drive.strip("\\").split("\\")[0] != "192.168.1.58":
        raise ValueError("Expected explicitly authorized SMB host")
    records = load_references(args.manifest, args.event_root, args.original_root)
    folder = TARGET / "private" / "raw-datasets" / (dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
    folder.mkdir(parents=True, exist_ok=False)
    (folder / "original").mkdir()
    (folder / "technical-inputs").mkdir()
    report = {"schema": "mizin-lightroom.raw-dataset/1", "startedUtc": dt.datetime.now(dt.timezone.utc).isoformat(),
              "status": "INCOMPLETE", "sourceShare": args.share, "eventRootId": args.event_root,
              "referenceCount": len(records), "copies": [], "metadataPairs": [], "decodedCount": 0,
              "sourceWriteOperations": 0, "photosUploaded": 0, "modelTrained": False,
              "inputDomain": "LIBRAW_CAMERA_WB_SRGB_HALF_SIZE_NO_AUTO_BRIGHT_V1", "error": None}
    try:
        source_paths = [Path(str(share / row["sourceRelative"])) for row in records]
        metadata = read_metadata(source_paths, args.perl, args.exiftool, folder / "source-metadata-args.txt")
        report["metadataPairs"] = [validate_pair(row, meta) for row, meta in zip(records, metadata)]
        (folder / "source-metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"phase": "SOURCE_METADATA_VERIFIED", "pairs": len(records), "dataset": str(folder)}), flush=True)
        progress = time.monotonic()
        local_paths = []
        for row, source, meta in zip(records, source_paths, metadata):
            local = folder / "original" / row["sourceRelative"]
            verified = copy_verified(source, local, int(meta["FileSize"]))
            verified.update({"imageId": row["imageId"], "relative": row["sourceRelative"]})
            report["copies"].append(verified)
            local_paths.append(local)
            if time.monotonic() - progress >= 15:
                print(json.dumps({"phase": "COPY", "files": len(local_paths), "total": len(records),
                                  "bytes": sum(v["bytes"] for v in report["copies"])}), flush=True)
                progress = time.monotonic()
        local_meta = read_metadata(local_paths, args.perl, args.exiftool, folder / "local-metadata-args.txt")
        [validate_pair(row, meta) for row, meta in zip(records, local_meta)]
        report["localMetadataRevalidated"] = True
        print(json.dumps({"phase": "LOCAL_METADATA_VERIFIED", "files": len(local_paths)}), flush=True)
        with (folder / "paired-features.jsonl").open("x", encoding="utf-8") as feature_stream:
            for row, local, meta, copy in zip(records, local_paths, local_meta, report["copies"]):
                jpeg = folder / "technical-inputs" / (str(row["imageId"]) + ".jpg")
                result = technical_render(local, jpeg, meta)
                if sha256_file(local) != copy["sha256"]:
                    raise ValueError("RAW copy changed during decoding")
                record = {"imageId": row["imageId"], "physicalFileId": row["physicalFileId"],
                          "eventRootId": row["eventRootId"], "captureTime": row["captureTime"],
                          "styleVariant": row["styleVariant"], "approvalStatus": row["approvalStatus"],
                          "currentParameters": row["currentParameters"], "rawRelative": "original/" + row["sourceRelative"].replace("\\", "/"),
                          "rawSha256": copy["sha256"], "inputJpegRelative": "technical-inputs/" + jpeg.name,
                          **result}
                feature_stream.write(json.dumps(record, ensure_ascii=False, allow_nan=False) + "\n")
                feature_stream.flush()
                report["decodedCount"] += 1
                if time.monotonic() - progress >= 15:
                    print(json.dumps({"phase": "DECODE", "files": report["decodedCount"], "total": len(records)}), flush=True)
                    progress = time.monotonic()
        report["status"] = "VERIFIED_RAW_AND_TECHNICAL_INPUTS"
    except BaseException as error:
        report["status"] = "FAILED_PRESERVED_PARTIAL_DATASET"
        report["error"] = str(error)
        raise
    finally:
        report["finishedUtc"] = dt.datetime.now(dt.timezone.utc).isoformat()
        (folder / "dataset.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        (folder / "SHA256SUMS.txt").write_text("\n".join(r["sha256"] + " *original/" + r["relative"].replace("\\", "/") for r in report["copies"]) + "\n", encoding="utf-8")
        print(json.dumps({"phase": "FINISHED", "status": report["status"], "copied": len(report["copies"]),
                          "decoded": report["decodedCount"], "dataset": str(folder)}, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    main()
