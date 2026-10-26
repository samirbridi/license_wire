"""Static Metro indexed RAM bundle reader. Never imports or executes module code.

Format reference: facebook/metro, shared/output/RamBundle/as-indexed-file.js.
Originals are unchanged; derived sources stay in this target's private runtime.
"""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

TARGET = Path(__file__).resolve().parents[1]
KEYWORDS = re.compile(r"sd.?card|record|playback|pantilt|preset|ptz|zoom|cruise|sendP2P|sendRDT|motor|cw701|mod11|hlc7", re.I)


def inspect(data):
    if len(data) < 12:
        raise ValueError("Truncated RAM bundle")
    magic, slots, startup_size = struct.unpack_from("<3I", data)
    base = 12 + slots * 8
    if magic != 0xFB0BD1E5 or slots > 1000000 or base + startup_size > len(data):
        raise ValueError("Invalid RAM bundle header")
    modules = []
    for module_id in range(slots):
        offset, size = struct.unpack_from("<2I", data, 12 + 8 * module_id)
        if not size:
            continue
        start = base + offset
        if offset < startup_size or start + size > len(data):
            raise ValueError("Module span outside RAM bundle")
        source = data[start:start + size]
        if not source.endswith(b"\0"):
            raise ValueError("Module is not null terminated")
        modules.append({"id": module_id, "offset": start, "bytes": size, "span_sha256": hashlib.sha256(source).hexdigest(), "source": source[:-1]})
    return slots, data[base:base + startup_size], modules


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("bundle", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--include", type=int, nargs="*", default=[])
    args = parser.parse_args()
    output = args.output.resolve()
    if not (output.is_relative_to(TARGET / "runtime") or output.is_relative_to(TARGET / "evidence/private")):
        raise ValueError("Derived vendor code must remain in private target storage")
    if args.bundle.stat().st_size > 100000000:
        raise ValueError("Bundle exceeds analysis bound")
    data = args.bundle.read_bytes()
    slots, startup, modules = inspect(data)
    folder = output / "modules"
    folder.mkdir(parents=True, exist_ok=True)
    selected = []
    inventory = []
    for module in modules:
        text = module["source"].decode("utf-8")
        matches = sorted(set(match.group().lower() for match in KEYWORDS.finditer(text)))
        entry = {key: value for key, value in module.items() if key != "source"}
        inventory.append(entry)
        if module["id"] in args.include:
            matches.append("explicit-module")
        if not matches:
            continue
        destination = folder / ("module-" + str(module["id"]) + ".js")
        if destination.exists():
            if destination.read_bytes() != module["source"]:
                raise ValueError("Existing derived source differs; use a new output directory")
        else:
            with destination.open("xb") as stream:
                stream.write(module["source"])
        selected.append({**entry, "matches": matches})
    receipt = {"bundle_sha256": hashlib.sha256(data).hexdigest(), "slots": slots, "modules": len(modules), "startup": startup.rstrip(b"\0").decode("utf-8"), "selected": selected, "executed": False}
    (output / "ram-inventory.json").write_text(json.dumps(inventory, indent=2), encoding="utf-8")
    (output / "ram-analysis.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps({"slots": slots, "modules": len(modules), "selected": len(selected), "executed": False}))


if __name__ == "__main__":
    main()
