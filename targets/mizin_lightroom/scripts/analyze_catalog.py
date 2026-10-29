"""Extract user-owned develop settings from a verified, local Lightroom snapshot.

Catalog schema is observed, not an Adobe API contract. Never executes Lua, opens
the working catalog, or declares an image approved based on history alone.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import math
import ntpath
import re
import sqlite3
import statistics
import zlib
from pathlib import Path

MAX_SETTINGS_BYTES = 16 * 1024 * 1024
IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z_0-9]*")
NUMBER = re.compile(r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?")
PARAMETERS = (
    "Look", "Exposure2012", "Contrast2012", "Highlights2012", "Shadows2012",
    "Whites2012", "Blacks2012", "Temperature", "Tint", "CustomTemperature",
    "CustomTint", "WhiteBalance", "Vibrance", "Saturation", "Clarity2012",
    "Texture", "Dehaze", "ConvertToGrayscale", "ProcessVersion", "CameraProfile",
    "CropAngle", "CropTop", "CropBottom", "CropLeft", "CropRight", "Sharpness",
    "LuminanceSmoothing", "ColorNoiseReduction", "LensProfileEnable",
    "ParametricDarks", "ParametricLights", "ParametricHighlights", "ParametricShadows",
    "SplitToningBalance", "SplitToningHighlightHue", "SplitToningHighlightSaturation",
    "SplitToningShadowHue", "SplitToningShadowSaturation", "ToneCurveName2012",
    "ToneCurvePV2012", "ToneCurvePV2012Red", "ToneCurvePV2012Green", "ToneCurvePV2012Blue",
) + tuple(
    prefix + color
    for prefix in ("HueAdjustment", "SaturationAdjustment", "LuminanceAdjustment")
    for color in ("Red", "Orange", "Yellow", "Green", "Aqua", "Blue", "Purple", "Magenta")
) + tuple(
    "ColorGrade" + part
    for part in ("Blending", "Balance", "GlobalHue", "GlobalSat", "GlobalLum",
                 "MidtoneHue", "MidtoneSat", "MidtoneLum", "HighlightLum", "ShadowLum")
)


def decode_settings(value: str | bytes) -> tuple[str, str]:
    if isinstance(value, str):
        if len(value.encode("utf-8")) > MAX_SETTINGS_BYTES:
            raise ValueError("Settings text exceeds limit")
        return value, "plain_text"
    if not isinstance(value, bytes) or len(value) < 6:
        raise ValueError("Unsupported settings storage")
    expected = int.from_bytes(value[:4], "big")
    if expected > MAX_SETTINGS_BYTES:
        raise ValueError("Declared decompressed size exceeds limit")
    decoder = zlib.decompressobj()
    decoded = decoder.decompress(value[4:], MAX_SETTINGS_BYTES + 1)
    if (len(decoded) > MAX_SETTINGS_BYTES or not decoder.eof or decoder.unconsumed_tail
            or decoder.unused_data or len(decoded) != expected):
        raise ValueError("Invalid length-prefixed zlib settings")
    return decoded.decode("utf-8"), "u32be_length_zlib"


class LuaLiteralReader:
    """Small data-only reader for observed 's = {...}' catalog serialization."""

    def __init__(self, text: str):
        self.text = text
        self.pos = 0
        self.values = 0

    def space(self):
        while self.pos < len(self.text):
            if self.text[self.pos].isspace():
                self.pos += 1
            elif self.text.startswith("--", self.pos):
                end = self.text.find("\n", self.pos)
                self.pos = len(self.text) if end < 0 else end + 1
            else:
                break

    def consume(self, token):
        self.space()
        if not self.text.startswith(token, self.pos):
            raise ValueError(f"Expected {token!r} at offset {self.pos}")
        self.pos += len(token)

    def string(self):
        quote = self.text[self.pos]
        self.pos += 1
        out = []
        escapes = {"a": "\a", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v", "\\": "\\", '"': '"', "'": "'"}
        while self.pos < len(self.text):
            char = self.text[self.pos]
            self.pos += 1
            if char == quote:
                return "".join(out)
            if char != "\\":
                out.append(char)
                continue
            if self.pos >= len(self.text):
                raise ValueError("Unterminated escape")
            char = self.text[self.pos]
            self.pos += 1
            if char.isdigit():
                digits = char
                while len(digits) < 3 and self.pos < len(self.text) and self.text[self.pos].isdigit():
                    digits += self.text[self.pos]
                    self.pos += 1
                code = int(digits)
                if code > 255:
                    raise ValueError("Invalid Lua byte escape")
                out.append(chr(code))
            elif char in escapes:
                out.append(escapes[char])
            elif char in "\r\n":
                out.append("\n")
            else:
                raise ValueError("Unsupported Lua escape")
        raise ValueError("Unterminated string")

    def value(self, depth=0):
        self.space()
        self.values += 1
        if depth > 64 or self.values > 100000:
            raise ValueError("Literal complexity limit exceeded")
        if self.pos >= len(self.text):
            raise ValueError("Missing value")
        char = self.text[self.pos]
        if char == "{":
            return self.table(depth + 1)
        if char in "\"'":
            return self.string()
        for word, result in (("true", True), ("false", False), ("nil", None)):
            if self.text.startswith(word, self.pos) and (self.pos + len(word) == len(self.text) or not re.match(r"\w", self.text[self.pos + len(word)])):
                self.pos += len(word)
                return result
        number = NUMBER.match(self.text, self.pos)
        if number:
            self.pos = number.end()
            value = float(number.group()) if any(x in number.group().lower() for x in (".", "e")) else int(number.group())
            if isinstance(value, float) and not math.isfinite(value):
                raise ValueError("Nonfinite number")
            return value
        raise ValueError(f"Nonliteral token at offset {self.pos}")

    def table(self, depth):
        self.consume("{")
        named = {}
        array = []
        while True:
            self.space()
            if self.text.startswith("}", self.pos):
                self.pos += 1
                if named and array:
                    for index, value in enumerate(array, 1):
                        if index in named:
                            raise ValueError("Ambiguous mixed table")
                        named[index] = value
                    return named
                return named if named or not array else array
            key = None
            if self.text.startswith("[", self.pos):
                self.pos += 1
                key = self.value(depth)
                if type(key) not in (str, int):
                    raise ValueError("Unsupported table key")
                self.consume("]")
                self.consume("=")
            else:
                identifier = IDENTIFIER.match(self.text, self.pos)
                if identifier:
                    saved = self.pos
                    self.pos = identifier.end()
                    self.space()
                    if self.text.startswith("=", self.pos):
                        key = identifier.group()
                        self.pos += 1
                    else:
                        self.pos = saved
            value = self.value(depth)
            if key is None:
                array.append(value)
            else:
                if key in named:
                    raise ValueError("Duplicate table key")
                named[key] = value
            self.space()
            if self.text.startswith((",", ";"), self.pos):
                self.pos += 1
            elif not self.text.startswith("}", self.pos):
                raise ValueError(f"Expected separator at offset {self.pos}")

    def read(self):
        self.consume("s")
        self.consume("=")
        result = self.value()
        self.space()
        if self.pos != len(self.text) or not isinstance(result, dict):
            raise ValueError("Expected one complete settings table")
        return result


def parse_settings(value):
    text, storage = decode_settings(value)
    parsed = LuaLiteralReader(text).read()
    return parsed, storage, hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def open_readonly_catalog(path: Path):
    if str(path).startswith("\\\\"):
        raise ValueError("Analyze a local snapshot, never a network catalog")
    connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro&immutable=1", uri=True)
    connection.row_factory = sqlite3.Row
    connection.enable_load_extension(False)
    connection.execute("PRAGMA query_only=ON")
    connection.execute("PRAGMA trusted_schema=OFF")
    return connection


def is_mobile_proxy(path):
    return "downloaded-smart-previews" in path.replace("\\", "/").lower()


def numeric_summary(values):
    numbers = sorted(v for v in values if type(v) in (int, float) and math.isfinite(v))
    if not numbers:
        return {"observations": 0}
    return {"observations": len(numbers), "min": numbers[0], "median": statistics.median(numbers), "max": numbers[-1]}


def analyze(snapshot: Path, quick_check=True):
    receipt = json.loads((snapshot / "snapshot.json").read_text(encoding="utf-8-sig"))
    required = ("AllCopyHashesVerified", "SourceMetadataStable", "RuntimeFilesAbsentBeforeAndAfter")
    if receipt.get("Status") != "VERIFIED" or not all(receipt.get(key) for key in required):
        raise ValueError("Snapshot is not verified")
    catalog_name = receipt["CatalogName"]
    if ntpath.basename(catalog_name) != catalog_name:
        raise ValueError("Invalid catalog filename in receipt")
    catalog = snapshot / "original" / catalog_name
    expected = next(r["CopySha256"] for r in receipt["Files"] if r["Relative"] == catalog_name)
    original_hash = sha256_file(catalog)
    if original_hash != expected:
        raise ValueError("Catalog snapshot hash mismatch")
    out = snapshot / "analysis" / ("extraction-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    out.mkdir(parents=True, exist_ok=False)
    approval_path = snapshot / "dataset-approval.json"
    approval = json.loads(approval_path.read_text(encoding="utf-8")) if approval_path.exists() else {}
    reference_approved = (approval.get("schema") == "mizin-lightroom.reference-approval/1"
                          and approval.get("allOctoberEditsReviewedAndApproved") is True
                          and approval.get("source") == "DIRECT_HUMAN_USER_REPLY")
    connection = open_readonly_catalog(catalog)
    checks = [r[0] for r in connection.execute("PRAGMA quick_check")] if quick_check else ["NOT_REPEATED"]
    if quick_check and checks != ["ok"]:
        raise ValueError("SQLite quick_check failed")
    # Observed table/column names; failure is explicit if a future catalog changes them.
    queries = {
        "formats": "SELECT fileFormat,COUNT(*) AS count FROM Adobe_images GROUP BY fileFormat ORDER BY count DESC",
        "imageCount": "SELECT COUNT(*) AS count,SUM(masterImage IS NOT NULL) AS virtualCopies FROM Adobe_images",
        "history": "SELECT id_local,image,dateCreated,name,text FROM Adobe_libraryImageDevelopHistoryStep WHERE name LIKE 'Neurapix SmartPreset:%' ORDER BY image,dateCreated,id_local",
        "cameras": "SELECT cm.value AS model,COUNT(*) AS count FROM AgHarvestedExifMetadata e LEFT JOIN AgInternedExifCameraModel cm ON cm.id_local=e.cameraModelRef GROUP BY cm.value ORDER BY count DESC",
        "rootCounts": "SELECT r.id_local,r.absolutePath,COUNT(*) AS imageCount FROM Adobe_images i JOIN AgLibraryFile f ON f.id_local=i.rootFile JOIN AgLibraryFolder d ON d.id_local=f.folder JOIN AgLibraryRootFolder r ON r.id_local=d.rootFolder GROUP BY r.id_local ORDER BY imageCount DESC",
        "candidateRows": """SELECT i.id_local AS imageId,i.id_global AS imageUuid,i.rootFile AS physicalFileId,
            i.masterImage,i.fileFormat,i.rating,i.pick,i.colorLabels,i.captureTime,
            f.baseName,f.extension,f.idx_filename,d.pathFromRoot,r.id_local AS eventRootId,r.absolutePath,
            ds.text AS developText,ds.hasBigData,ds.hasDevelopAdjustments,ds.processVersion,
            cm.value AS cameraModel
            FROM Adobe_images i
            JOIN Adobe_imageDevelopSettings ds ON ds.image=i.id_local
            JOIN AgLibraryFile f ON f.id_local=i.rootFile
            JOIN AgLibraryFolder d ON d.id_local=f.folder
            JOIN AgLibraryRootFolder r ON r.id_local=d.rootFolder
            LEFT JOIN AgHarvestedExifMetadata ex ON ex.image=i.id_local
            LEFT JOIN AgInternedExifCameraModel cm ON cm.id_local=ex.cameraModelRef
            WHERE i.id_local IN (SELECT image FROM Adobe_libraryImageDevelopHistoryStep WHERE name LIKE 'Neurapix SmartPreset:%')
            ORDER BY i.id_local""",
    }
    formats = [dict(r) for r in connection.execute(queries["formats"])]
    images = dict(connection.execute(queries["imageCount"]).fetchone())
    cameras = [dict(r) for r in connection.execute(queries["cameras"])]
    root_counts = [dict(r) for r in connection.execute(queries["rootCounts"])]
    history = {}
    history_steps = 0
    for row in connection.execute(queries["history"]):
        history_steps += 1
        history[row["image"]] = dict(row)
    counters = collections.Counter()
    storage_counts = collections.Counter()
    numeric = collections.defaultdict(list)
    eligible_numeric = collections.defaultdict(list)
    differences = collections.Counter()
    errors = []
    eligible_files = set()
    eligible_events = set()
    eligible_cameras = collections.Counter()
    with (out / "candidate-settings.jsonl").open("x", encoding="utf-8") as stream:
        for raw in connection.execute(queries["candidateRows"]):
            row = dict(raw)
            counters["candidateImages"] += 1
            previous = history[row["imageId"]]
            try:
                current, current_storage, current_digest = parse_settings(row.pop("developText"))
                prior, history_storage, prior_digest = parse_settings(previous["text"])
            except (ValueError, UnicodeError, zlib.error) as error:
                counters["parseFailures"] += 1
                errors.append({"imageId": row["imageId"], "reason": str(error)})
                continue
            storage_counts["current:" + current_storage] += 1
            storage_counts["history:" + history_storage] += 1
            filename = str(row["baseName"]) + ("." + str(row["extension"]) if row["extension"] else "")
            full_path = ntpath.normpath(ntpath.join(str(row["absolutePath"]), row["pathFromRoot"] or "", filename))
            virtual = row["masterImage"] is not None
            proxy = is_mobile_proxy(full_path)
            raw_format = row["fileFormat"] in ("RAW", "DNG")
            rejected = row["pick"] is not None and row["pick"] < 0
            eligible = raw_format and not virtual and not proxy and not rejected
            selected = {key: current[key] for key in PARAMETERS if key in current}
            baseline = {key: prior[key] for key in PARAMETERS if key in prior}
            changed = sorted(key for key in set(selected) | set(baseline) if selected.get(key) != baseline.get(key))
            counters["parsedImages"] += 1
            counters["virtualCopies"] += virtual
            counters["mobileProxies"] += proxy
            counters["rejectedImages"] += rejected
            counters["settingsChangedAfterLastNeurapix"] += bool(changed)
            counters["monochromeCurrent"] += bool(current.get("ConvertToGrayscale"))
            counters["cacheAdjustmentsFlagNull"] += row["hasDevelopAdjustments"] is None
            differences.update(changed)
            for key, value in selected.items():
                if type(value) in (int, float):
                    numeric[key].append(value)
            if eligible:
                counters["technicalCandidates"] += 1
                eligible_files.add(row["physicalFileId"])
                eligible_events.add(row["eventRootId"])
                eligible_cameras[row["cameraModel"] or "UNKNOWN"] += 1
                for key, value in selected.items():
                    if type(value) in (int, float):
                        eligible_numeric[key].append(value)
            record = {
                "imageId": row["imageId"], "imageUuid": row["imageUuid"], "physicalFileId": row["physicalFileId"],
                "sourcePath": full_path, "sourceExistenceVerified": False, "eventRootId": row["eventRootId"],
                "captureTime": row["captureTime"], "cameraModel": row["cameraModel"], "fileFormat": row["fileFormat"],
                "isVirtualCopy": virtual, "isMobileProxy": proxy, "rating": row["rating"], "pick": row["pick"],
                "styleVariant": "monochrome" if current.get("ConvertToGrayscale") is True else "color" if current.get("ConvertToGrayscale") is False else "unknown",
                "hasBigData": row["hasBigData"], "currentSettingsDigest": current_digest,
                "lastNeurapixSettingsDigest": prior_digest, "lastNeurapixHistoryId": previous["id_local"],
                "lastNeurapixDate": previous["dateCreated"], "styleHistoryName": previous["name"],
                "currentParameters": selected, "lastNeurapixParameters": baseline,
                "changedParameterNames": changed, "technicalCandidate": eligible,
                "approvalStatus": "REFERENCE_APPROVED_BY_PHOTOGRAPHER" if reference_approved else "UNKNOWN_REQUIRES_PHOTOGRAPHER_SELECTION",
                "approvalEvidence": "dataset-approval.json" if reference_approved else None,
                "splitGroup": str(row["eventRootId"]),
                "limitations": ["Missing parameters remain missing; Lightroom defaults were not invented.",
                                "Parameter changes do not prove human review.",
                                "Local masks, external profiles/LUTs and BigData are not reconstructed here."],
            }
            stream.write(json.dumps(record, ensure_ascii=False, allow_nan=False) + "\n")
    connection.close()
    after_hash = sha256_file(catalog)
    if after_hash != original_hash:
        raise ValueError("Snapshot changed during read-only analysis")
    summary = {
        "schema": "mizin-lightroom.catalog-extraction/1", "generatedUtc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "snapshotStatus": receipt["Status"], "catalogSha256Before": original_hash, "catalogSha256After": after_hash,
        "catalogUnchanged": True, "quickCheck": checks, "images": images, "formats": formats,
        "neurapixHistorySteps": history_steps, "imagesWithNeurapixHistory": len(history),
        "counts": dict(counters), "storageCounts": dict(storage_counts),
        "technicalCandidateDistinctFiles": len(eligible_files), "technicalCandidateEventRoots": len(eligible_events),
        "technicalCandidateCameras": dict(eligible_cameras), "cameraCountsWholeCatalog": cameras,
        "numericParametersAllParsed": {key: numeric_summary(v) for key, v in sorted(numeric.items())},
        "numericParametersTechnicalCandidates": {key: numeric_summary(v) for key, v in sorted(eligible_numeric.items())},
        "changedParameterCounts": dict(differences.most_common()), "parseErrors": errors,
        "rootFoldersPrivate": root_counts, "rawImagesRead": 0, "modelTrained": False,
        "approvalInferred": False, "referenceApprovalConfirmedByUser": reference_approved, "publiclyExportable": False,
        "limitations": ["Observed internal catalog schema; not a stable public SDK.",
                        "Original-file access, profiles and neutral renders remain unverified.",
                        "Reference approval is recorded only from explicit user evidence; the training dataset still needs input images and QA.",
                        "Event-root grouping is a proposed split boundary; not a guarantee of independence."],
    }
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    (out / "queries.json").write_text(json.dumps(queries, ensure_ascii=False, indent=2), encoding="utf-8")
    return out, summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot", type=Path)
    args = parser.parse_args()
    out, summary = analyze(args.snapshot)
    print(json.dumps({"outputDirectory": str(out), "quickCheck": summary["quickCheck"], "images": summary["images"],
                      "neurapixHistorySteps": summary["neurapixHistorySteps"], "imagesWithNeurapixHistory": summary["imagesWithNeurapixHistory"],
                      "counts": summary["counts"], "technicalCandidateDistinctFiles": summary["technicalCandidateDistinctFiles"],
                      "technicalCandidateEventRoots": summary["technicalCandidateEventRoots"], "catalogUnchanged": summary["catalogUnchanged"]}, ensure_ascii=True))


if __name__ == "__main__":
    main()
