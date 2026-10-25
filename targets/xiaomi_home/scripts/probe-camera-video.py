"""Decode bounded local camera streams to a null sink; never record images."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
FFMPEG = ROOT.parent / "mizin_playout/binaries/qa/ffmpeg/ffmpeg-n8.1-latest-win64-gpl-shared-8.1/bin/ffmpeg.exe"
parser = argparse.ArgumentParser()
parser.add_argument("aliases", nargs="+")
parser.add_argument("--duration", type=int, default=10)
parser.add_argument("--read-timeout", type=int, default=15)
args = parser.parse_args()
if not 3 <= args.duration <= 60:
    parser.error("Duration must be between 3 and 60 seconds")
if not 5 <= args.read_timeout <= 30:
    parser.error("Read timeout must be between 5 and 30 seconds")
private = ROOT / "evidence/private"
registered = {item["alias"]: item for item in json.loads((private / "registered-streams.json").read_text(encoding="utf-8-sig"))}
if any(alias not in registered for alias in args.aliases):
    parser.error("Only the owner's registered local camera aliases are allowed")
results = []
for alias in args.aliases:
    command = [str(FFMPEG), "-hide_banner", "-nostdin", "-loglevel", "info", "-nostats",
               "-progress", "pipe:1", "-rw_timeout", str(args.read_timeout * 1000000), "-i",
               "http://127.0.0.1:19843/api/stream.mp4?src=" + alias,
               "-t", str(args.duration), "-map", "0:v:0", "-an", "-f", "null", "NUL"]
    started = time.monotonic()
    timed_out = False
    try:
        completed = subprocess.run(command, capture_output=True, timeout=args.duration + args.read_timeout + 15)
        stdout, stderr, returncode = completed.stdout, completed.stderr, completed.returncode
    except subprocess.TimeoutExpired as error:
        timed_out = True
        stdout, stderr, returncode = error.stdout or b"", error.stderr or b"", None
    text = stdout.decode("utf-8", "replace")
    diagnostics = stderr.decode("utf-8", "replace")
    (private / (alias + "-ffmpeg.log")).write_text(diagnostics, encoding="utf-8")
    frames = [int(value) for value in re.findall(r"^frame=(\d+)", text, re.M)]
    times = [int(value) for value in re.findall(r"^out_time_us=(\d+)", text, re.M)]
    metadata = re.search(r"Video: ([^,]+),[^\r\n]*? (\d{3,5})x(\d{3,5})", diagnostics)
    decoded_metadata = re.search(r"Output #[\s\S]*?Video: [^\r\n]*? (\d{3,5})x(\d{3,5})", diagnostics)
    if timed_out:
        failure = "bounded_test_timeout"
    elif "500 Internal Server Error" in diagnostics or "Server returned 500" in diagnostics:
        failure = "bridge_could_not_open_camera"
    elif "Connection refused" in diagnostics:
        failure = "local_bridge_unavailable"
    elif returncode != 0:
        failure = "decoder_or_transport_error"
    else:
        failure = None
    result = {"alias": alias, "model": registered[alias]["model"],
              "requested_seconds": args.duration, "elapsed_seconds": round(time.monotonic() - started, 2),
              "decoded_frames": max(frames, default=0), "decoded_seconds": max(times, default=0) / 1000000,
              "returncode": returncode, "failure": failure,
              "codec": metadata.group(1) if metadata else None,
              "advertised_width": int(metadata.group(2)) if metadata else None,
              "advertised_height": int(metadata.group(3)) if metadata else None,
              "width": int(decoded_metadata.group(1)) if decoded_metadata else None,
              "height": int(decoded_metadata.group(2)) if decoded_metadata else None}
    result["video_decode_pass"] = bool(returncode == 0 and result["decoded_frames"] > 0)
    results.append(result)
    (private / "latest-video-probes.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    with (private / "video-probe-history.jsonl").open("a", encoding="utf-8") as history:
        history.write(json.dumps({"observed_utc_epoch": time.time(), **result}) + "\n")
    print(json.dumps(result), flush=True)
