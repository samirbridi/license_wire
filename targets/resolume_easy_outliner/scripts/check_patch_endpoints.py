import urllib.request
import json
import sys
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

wire_file = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"

# Check if /patch/open works or /patch/reload
for ep, payload in [
    ("/patch/open", {"path": wire_file}),
    ("/patch/save", {}),
]:
    try:
        resp = wire_bridge.post(ep, payload)
        print(f"POST {ep} SUCCESS:", resp)
    except Exception as e:
        print(f"POST {ep} ERROR:", e)
