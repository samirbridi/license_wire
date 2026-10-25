"""Boundary tests for local authorization; no live credentials or Xiaomi calls."""
import importlib.util
import json
from pathlib import Path
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("xiaomi_qr", Path(__file__).with_name("xiaomi-qr-login.py"))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class AuthorizationBoundaries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = helper.ThreadingHTTPServer(("127.0.0.1", 0), helper.Handler)
        helper.PORT = cls.server.server_port
        cls.url = f"http://127.0.0.1:{helper.PORT}"
        cls.worker = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.worker.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        helper.STATE.clear()
        helper.STATE.update(phase="idle", message="test", expires_at=0)

    def test_only_official_https_targets(self):
        for url in ("http://account.xiaomi.com/", "https://account.xiaomi.com.evil.test/",
                    "https://evil.test/", "https://user@account.xiaomi.com/",
                    "https://account.xiaomi.com:8443/"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                helper.xiaomi_url(url)
        self.assertEqual(helper.xiaomi_url("https://sts.api.io.mi.com/sts"), "https://sts.api.io.mi.com/sts")

    def test_status_never_returns_private_fields(self):
        helper.STATE.update(passToken="PRIVATE_TEST_SENTINEL", userId="PRIVATE_TEST_ID", cookies="PRIVATE_TEST_COOKIE")
        with urllib.request.urlopen(self.url + "/status", timeout=3) as response:
            body = response.read().decode()
        self.assertNotIn("PRIVATE_TEST", body)
        self.assertEqual(set(json.loads(body)), {"phase", "message", "expires_at"})

    def test_cross_origin_cannot_start_login(self):
        request = urllib.request.Request(self.url + "/start", method="POST", data=b"",
            headers={"Origin": "https://evil.test", "X-CSRF-Token": helper.CSRF})
        with patch.object(helper, "authorize") as authorize:
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request, timeout=3)
            self.assertEqual(error.exception.code, 403)
            authorize.assert_not_called()

    def test_page_no_cache_and_nonce_match(self):
        with urllib.request.urlopen(self.url, timeout=3) as response:
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertIn("nonce-" + helper.CSRF, response.headers["Content-Security-Policy"])
            page = response.read().decode()
        self.assertIn('nonce="' + helper.CSRF + '"', page)
        self.assertNotIn("CSRF_VALUE", page)

    def test_one_request_cannot_start_duplicate_flows(self):
        def request():
            return urllib.request.Request(self.url + "/start", method="POST", data=b"",
                headers={"Origin": self.url, "X-CSRF-Token": helper.CSRF})
        with patch.object(helper, "authorize") as authorize:
            with urllib.request.urlopen(request(), timeout=3) as response:
                self.assertEqual(response.status, 202)
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request(), timeout=3)
            self.assertEqual(error.exception.code, 409)
            authorize.assert_called_once()


if __name__ == "__main__":
    unittest.main()
