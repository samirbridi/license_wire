"""Local QR login helper for the owner's Xiaomi cameras; no password intake.

Protocol reference: PiotrMachowski/Xiaomi-cloud-tokens-extractor (MIT),
QrCodeXiaomiCloudConnector. See evidence/tools/xiaomi-qr-reference/LICENSE.
Session material stays in memory or the ignored runtime directory.
"""

import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "runtime" / "qr-login"
EXE = ROOT / "runtime" / "go2rtc-v1.9.15" / "go2rtc.exe"
PORT = 19840
BRIDGE_PORT = 19843
MEDIA_PORT = 19844
CSRF = secrets.token_urlsafe(32)
LOCK = threading.RLock()
STATE = {"phase": "idle", "message": "Gere um QR code e confirme o acesso no Xiaomi Home.", "expires_at": 0}
QR_IMAGE = b""
QR_TYPE = "image/png"


def xiaomi_url(url):
    parsed = urllib.parse.urlsplit(url)
    host = (parsed.hostname or "").lower()
    if (parsed.scheme != "https" or parsed.username or parsed.password
            or parsed.port not in (None, 443)
            or not any(host == domain or host.endswith("." + domain)
                       for domain in ("xiaomi.com", "mi.com"))):
        raise ValueError("Unexpected authorization domain")
    return url


class XiaomiRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        xiaomi_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def read_json(body):
    return json.loads(body.decode("utf-8").lstrip().removeprefix("&&&START&&&"))


def set_state(phase, message, **extra):
    with LOCK:
        STATE.update(phase=phase, message=message, **extra)


def public_state():
    with LOCK:
        # Deliberate allowlist: never return identity, cookies or credentials.
        return {key: STATE[key] for key in
                ("phase", "message", "expires_at", "camera_count") if key in STATE}


def launch_bridge(user_id, pass_token):
    if not isinstance(user_id, (str, int)) or not str(user_id).isdigit():
        raise ValueError("Invalid account identity")
    if not isinstance(pass_token, str) or not pass_token or len(pass_token) > 8192:
        raise ValueError("Invalid authorization credential")
    # Reserve-check the new ports; never displace the original test instance.
    for port in (BRIDGE_PORT, MEDIA_PORT):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", port))
    if not EXE.is_file():
        raise FileNotFoundError("Verified bridge executable missing")
    RUNTIME.mkdir(parents=True, exist_ok=True)
    config_path = RUNTIME / ("session-" + secrets.token_hex(8) + ".json")
    config = {
        "api": {"listen": f"127.0.0.1:{BRIDGE_PORT}"},
        "rtsp": {"listen": ""},
        "webrtc": {"listen": f"127.0.0.1:{MEDIA_PORT}", "ice_servers": [],
                   "candidates": [f"127.0.0.1:{MEDIA_PORT}"]},
        "streams": {}, "xiaomi": {str(user_id): pass_token},
    }
    with config_path.open("x", encoding="utf-8") as config_file:
        json.dump(config, config_file)
    os.chmod(config_path, 0o600)
    with (RUNTIME / "bridge.log").open("ab") as log_file:
        process = subprocess.Popen(
            [str(EXE), "-config", str(config_path)], cwd=RUNTIME,
            stdin=subprocess.DEVNULL, stdout=log_file, stderr=log_file,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    (RUNTIME / "process.json").write_text(json.dumps({
        "pid": process.pid, "executable": str(EXE), "config": str(config_path),
        "url": f"http://127.0.0.1:{BRIDGE_PORT}/", "started_utc_epoch": time.time()
    }), encoding="utf-8")
    for _ in range(20):
        if process.poll() is not None:
            raise RuntimeError("Local bridge stopped")
        try:
            url = f"http://127.0.0.1:{BRIDGE_PORT}/api/xiaomi?" + urllib.parse.urlencode(
                {"id": str(user_id), "region": "cn"})
            with urllib.request.urlopen(url, timeout=20) as response:
                cameras = json.load(response)
            camera_items = cameras.get("sources", []) if isinstance(cameras, dict) else cameras
            count = len(camera_items) if isinstance(camera_items, list) else None
            set_state("connected", "Conta autorizada. Abra o painel de câmeras; o vídeo ainda precisa ser testado.",
                      camera_count=count)
            return
        except urllib.error.HTTPError:
            set_state("authorized", "Autorização recebida. A listagem precisa de verificação no painel de câmeras.")
            return
        except urllib.error.URLError:
            time.sleep(0.3)
    raise RuntimeError("Local bridge did not become available")


def authorize():
    global QR_IMAGE, QR_TYPE
    stage = "preparacao"
    try:
        opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), XiaomiRedirects())
        params = urllib.parse.urlencode({
            "_qrsize": "480", "qs": "%3Fsid%3Dxiaomiio%26_json%3Dtrue",
            "callback": "https://sts.api.io.mi.com/sts", "_hasLogo": "false",
            "sid": "xiaomiio", "serviceParam": "", "_locale": "en_GB",
            "_dc": str(int(time.time() * 1000))})
        with opener.open("https://account.xiaomi.com/longPolling/loginUrl?" + params, timeout=15) as response:
            info = read_json(response.read(256000))
        qr_url, polling_url = xiaomi_url(info["qr"]), xiaomi_url(info["lp"])
        with opener.open(qr_url, timeout=15) as response:
            image = response.read(2000001)
        if len(image) > 2000000:
            raise ValueError("Oversized image")
        if image.startswith(b"\x89PNG\r\n\x1a\n"):
            content_type = "image/png"
        elif image.startswith(b"\xff\xd8\xff"):
            content_type = "image/jpeg"
        else:
            raise ValueError("Unexpected image format")
        expires_at = time.time() + min(max(float(info.get("timeout", 180)), 10), 300)
        with LOCK:
            QR_IMAGE, QR_TYPE = image, content_type
        set_state("waiting", "Escaneie com o Xiaomi Home já conectado à sua conta e confirme o acesso no celular.",
                  expires_at=expires_at)
        stage = "confirmacao"
        while time.time() < expires_at:
            try:
                with opener.open(polling_url, timeout=10) as response:
                    result = read_json(response.read(256000))
            except (TimeoutError, socket.timeout):
                continue
            except urllib.error.URLError as error:
                if isinstance(error.reason, (TimeoutError, socket.timeout)):
                    continue
                raise
            if result.get("userId") and result.get("passToken"):
                with LOCK:
                    QR_IMAGE = b""
                set_state("starting", "Acesso confirmado no celular. Preparando a sessão local de câmeras.")
                stage = "ponte_local"
                launch_bridge(result["userId"], result["passToken"])
                return
            if result.get("code") not in (None, 0):
                break
            time.sleep(1)
        set_state("expired", "O QR code expirou ou não foi aprovado. Você pode gerar outro.")
    except Exception as error:
        # Exception messages and response bodies may contain credential URLs.
        set_state("error", f"Não foi possível concluir a etapa {stage} ({type(error).__name__}). Nenhuma senha foi solicitada.")
    finally:
        with LOCK:
            QR_IMAGE = b""


PAGE = '''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Acesso Xiaomi por QR code</title><style>
body{font:17px system-ui;background:#11171e;color:#eaf0f5;margin:0;padding:32px}main{max-width:650px;margin:30px auto}
button,a{font:inherit;border:0;border-radius:9px;padding:12px 18px;background:#51dfaa;color:#082c22;text-decoration:none;cursor:pointer}
button:disabled{opacity:.5;cursor:wait}p{line-height:1.6;color:#c5d1dc}img{display:none;width:min(350px,90%);background:white;padding:12px;border-radius:12px;margin:25px 0}
#bridge{display:none}small{display:block;color:#99a9b6;margin-top:28px}</style>
<main><h1>Acesse pelo Xiaomi Home</h1><p>Use o app já conectado à sua conta para escanear o QR code e confirmar o acesso às suas câmeras. Esta página não pede senha.</p>
<button id="start">Gerar QR code</button><p id="status" role="status"></p><img id="qr" alt="QR code de autorização gerado pela Xiaomi">
<a id="bridge" href="http://127.0.0.1:19843/add.html">Abrir painel de câmeras</a>
<small>Teste neste computador · região China · vídeo ainda não validado</small></main>
<script nonce="NONCE">let loaded=false;const b=document.querySelector('#start'),q=document.querySelector('#qr'),s=document.querySelector('#status'),a=document.querySelector('#bridge');
b.onclick=async()=>{b.disabled=true;loaded=false;q.style.display='none';await fetch('/start',{method:'POST',headers:{'X-CSRF-Token':'CSRF_VALUE'}});await update()};
async function update(){try{const r=await fetch('/status',{cache:'no-store'}),v=await r.json();s.textContent=v.message;b.disabled=['requesting','waiting','starting','connected','authorized'].includes(v.phase);if(v.phase==='waiting'&&!loaded){q.src='/qr?ts='+Date.now();q.style.display='block';loaded=true}if(v.phase!=='waiting')q.style.display='none';if(['connected','authorized'].includes(v.phase)){a.style.display='inline-block';clearInterval(timer)}}catch{s.textContent='A sessão local não respondeu.'}}
const timer=setInterval(update,2000);update();</script></html>'''


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def allowed(self):
        return self.headers.get("Host") in (f"127.0.0.1:{PORT}", f"localhost:{PORT}")

    def reply(self, code, body, content_type):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'nonce-" + CSRF + "'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.allowed():
            self.reply(403, b"Forbidden", "text/plain")
            return
        path = urllib.parse.urlsplit(self.path).path
        if path == "/":
            self.reply(200, PAGE.replace("NONCE", CSRF).replace("CSRF_VALUE", CSRF).encode(), "text/html; charset=utf-8")
        elif path == "/status":
            self.reply(200, json.dumps(public_state(), ensure_ascii=False).encode(), "application/json; charset=utf-8")
        elif path == "/qr":
            with LOCK:
                body, kind = QR_IMAGE, QR_TYPE
            self.reply(200 if body else 404, body or b"No QR available", kind if body else "text/plain")
        else:
            self.reply(404, b"Not found", "text/plain")

    def do_POST(self):
        origin = self.headers.get("Origin")
        if (not self.allowed() or origin not in (f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}")
                or not secrets.compare_digest(self.headers.get("X-CSRF-Token", ""), CSRF)):
            self.reply(403, b"Forbidden", "text/plain")
            return
        if self.path != "/start":
            self.reply(404, b"Not found", "text/plain")
            return
        with LOCK:
            if STATE["phase"] in ("requesting", "waiting", "starting", "connected", "authorized"):
                self.reply(409, b"Session already active", "text/plain")
                return
            set_state("requesting", "Solicitando um QR code à Xiaomi.", expires_at=0)
            threading.Thread(target=authorize, daemon=True).start()
        self.reply(202, b"{}", "application/json")


if __name__ == "__main__":
    print(f"Xiaomi QR helper: http://127.0.0.1:{PORT}/", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
