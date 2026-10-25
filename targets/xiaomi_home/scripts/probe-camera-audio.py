"""Decode three seconds of each authorized audio source to null, never record audio."""
import json
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[1]
private = root / 'evidence/private'
cameras = json.loads((root / 'runtime/central/cameras.json').read_text(encoding='utf-8-sig'))
ffmpeg = json.loads((root / 'runtime/central/tool-paths.json').read_text(encoding='utf-8-sig'))['ffmpeg']
results = []
for index, camera in enumerate(cameras, 1):
    view = camera.get('views', [{}])[0]
    alias = view.get('originalAlias') or camera.get('originalAlias') or camera['sourceAlias']
    if not re.fullmatch(r'[a-z0-9_]{1,64}', alias):
        raise ValueError('Invalid registered alias')
    command = [ffmpeg, '-hide_banner', '-nostdin', '-loglevel', 'info', '-nostats',
               '-rw_timeout', '12000000', '-i',
               'http://127.0.0.1:19843/api/stream.mp4?src=' + alias + '&video=h265&audio=all',
               '-t', '3', '-map', '0:a:0', '-vn', '-f', 'null', 'NUL']
    try:
        decoded = subprocess.run(command, capture_output=True, timeout=25)
        diagnostics = decoded.stderr.decode('utf-8', 'replace')
        (private / (alias + '-audio-decode.log')).write_text(diagnostics, encoding='utf-8')
        audio = re.search(r'Audio: ([^,]+), (\d+) Hz, ([^,\r\n]+)', diagnostics)
        result = {'unit': index, 'family': camera['family'], 'seconds_requested': 3,
                  'codec': audio.group(1) if audio else None,
                  'sample_rate': int(audio.group(2)) if audio else None,
                  'layout': audio.group(3) if audio else None,
                  'decode_pass': decoded.returncode == 0 and audio is not None}
    except subprocess.TimeoutExpired:
        result = {'unit': index, 'family': camera['family'], 'decode_pass': False, 'failure': 'timeout'}
    results.append(result)
    print(json.dumps(result), flush=True)
receipt = {'date': '2026-10-25', 'method': 'FFmpeg audio decode to null sink; no audio playback, recording or microphone transmission',
           'results': results, 'physical_listening_verified': False, 'talkback_verified': False}
(root / 'evidence/audio-codec-qa-2026-10-25.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
