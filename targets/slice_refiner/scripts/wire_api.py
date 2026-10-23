"""Small localhost-only Wire API client with an append-only operation log."""
import json
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:8081/api/v2'


def request(path, body=None, method=None):
    method = method or ('POST' if body is not None else 'GET')
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read()
            result = json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f'{method} {path}: {exc.code} {exc.read().decode()}') from exc
    with (ROOT / 'evidence/wire-api-operations.jsonl').open('a', encoding='utf-8') as log:
        log.write(json.dumps({'time': time.time(), 'method': method, 'path': path, 'body': body, 'result': result}) + '\n')
    return result


def classes():
    return request('/classes?limit=2000')['items']


def create(class_id, x=0, y=0):
    return request('/patch/nodes', {'class_id': class_id, 'position': {'x': x, 'y': y}})


def value(node, port, value):
    return request(f'/patch/nodes/{node}/inlets/{port}/value', value, 'POST')


def connect(source, outlet, target, inlet):
    return request('/patch/connections', {'source': {'node': source, 'outlet': outlet},
                                         'target': {'node': target, 'inlet': inlet}})


def snapshot(node, port, name, width=960, height=540):
    url = BASE + f'/patch/nodes/{node}/outlets/{port}/live?width={width}&height={height}'
    req = urllib.request.Request(url, headers={'Accept': 'image/png'})
    with urllib.request.urlopen(req, timeout=30) as response:
        data = response.read()
        if response.status != 200 or not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise RuntimeError('No valid rendered PNG returned: ' + str(response.status))
    path = ROOT / 'evidence' / name
    path.write_bytes(data)
    return str(path)
