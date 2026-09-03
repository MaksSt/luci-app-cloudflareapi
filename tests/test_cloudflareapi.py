import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
CHECK_SCRIPT = ROOT / "root/usr/bin/cloudflareapi-check"
API_SCRIPT = ROOT / "root/usr/libexec/cloudflareapi"
OVERVIEW = ROOT / "htdocs/luci-static/resources/view/cloudflareapi/overview.js"


class CloudflareApiScriptsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.bin = self.work / "bin"
        self.bin.mkdir()
        self.curl_log = self.work / "curl.log"
        self.uci_log = self.work / "uci.log"
        self.functions = self.work / "functions.sh"
        self.functions.write_text(
            """config_load() { :; }
config_get_bool() { eval \"$1=\\${MOCK_ENABLED:-1}\"; }
config_get() {
    case \"$3\" in
        token) value=\"${MOCK_TOKEN:-test-token}\" ;;
        ip_url) value=\"${MOCK_IP_URL:-https://api.ipify.org}\" ;;
        last_ip) value=\"${MOCK_LAST_IP:-}\" ;;
        zone_id) value=\"zone-1\" ;;
        record_id) value=\"record-1\" ;;
        name) value=\"example.com\" ;;
        type) value=\"A\" ;;
        enabled) value=\"1\" ;;
        *) value=\"${4:-}\" ;;
    esac
    eval \"$1=\\$value\"
}
config_foreach() { callback=\"$1\"; \"$callback\" record1; }
""",
            encoding="utf-8",
        )
        self._write_executable(
            "uci",
            """#!/bin/sh
if [ \"$1 $2\" = \"-q get\" ]; then
    printf '%s\\n' \"${MOCK_TOKEN:-test-token}\"
else
    printf '%s\\n' \"$*\" >> \"$MOCK_UCI_LOG\"
fi
""",
        )
        self._write_executable("logger", "#!/bin/sh\nexit 0\n")
        self._write_executable(
            "jsonfilter",
            """#!/bin/sh
payload="$(cat)"
case "$payload" in
    *'"success":true'*) printf 'true\\n' ;;
    *) printf 'false\\n' ;;
esac
""",
        )
        self._write_executable(
            "curl",
            """#!/bin/sh
printf '%s\\n' \"$*\" >> \"$MOCK_CURL_LOG\"
case \"$*\" in
    *\"-X PATCH\"*)
        if [ \"${MOCK_PATCH_FAIL:-0}\" = \"1\" ]; then
            printf '{\"success\":false,\"errors\":[{\"message\":\"denied\"}]}\\n'
        else
            printf '{\"success\":true}\\n'
        fi
        ;;
    *\"api.ipify.org\"*) printf '%s\\n' \"${MOCK_NEW_IP:-203.0.113.5}\" ;;
    *) printf '{\"success\":true,\"result\":[],\"result_info\":{\"page\":1,\"total_pages\":1}}\\n' ;;
esac
""",
        )

    def _write_executable(self, name, content):
        path = self.bin / name
        path.write_text(content, encoding="utf-8")
        path.chmod(0o755)

    def _env(self, **overrides):
        env = os.environ.copy()
        env.update(
            {
                "PATH": f"{self.bin}{os.pathsep}{env['PATH']}",
                "CLOUDFLARE_FUNCTIONS_LIB": str(self.functions),
                "MOCK_CURL_LOG": str(self.curl_log),
                "MOCK_UCI_LOG": str(self.uci_log),
                "MOCK_ENABLED": "1",
                "MOCK_TOKEN": "test-token",
                "MOCK_NEW_IP": "203.0.113.5",
                "MOCK_LAST_IP": "203.0.113.5",
            }
        )
        env.update(overrides)
        return env

    def _run_check(self, mode, **env):
        return subprocess.run(
            ["sh", str(CHECK_SCRIPT), mode],
            env=self._env(**env),
            text=True,
            capture_output=True,
            check=False,
        )

    def _run_api(self, *args):
        return subprocess.run(
            ["sh", str(API_SCRIPT), *args],
            env=self._env(),
            text=True,
            capture_output=True,
            check=False,
        )

    def test_manual_mode_updates_when_ip_is_unchanged(self):
        result = self._run_check("manual")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("-X PATCH", self.curl_log.read_text(encoding="utf-8"))
        self.assertIn(
            "cloudflareapi.settings.last_ip=203.0.113.5",
            self.uci_log.read_text(encoding="utf-8"),
        )

    def test_scheduled_mode_skips_when_ip_is_unchanged(self):
        result = self._run_check("daily")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("-X PATCH", self.curl_log.read_text(encoding="utf-8"))

    def test_cloudflare_update_failure_does_not_cache_ip(self):
        result = self._run_check("manual", MOCK_PATCH_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        uci_log = self.uci_log.read_text(encoding="utf-8")
        self.assertIn(
            "cloudflareapi.settings.last_error=Не все DNS-записи удалось обновить",
            uci_log,
        )
        self.assertNotIn("cloudflareapi.settings.last_ip=", uci_log)

    def test_invalid_public_ip_fails_without_update(self):
        result = self._run_check("manual", MOCK_NEW_IP="not-an-ip")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("-X PATCH", self.curl_log.read_text(encoding="utf-8"))
        self.assertIn(
            "cloudflareapi.settings.last_error=Публичный IPv4 не получен",
            self.uci_log.read_text(encoding="utf-8"),
        )

    def test_api_uses_requested_zone_page(self):
        result = self._run_api("zones", "3")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(
            "/zones?page=3&per_page=50",
            self.curl_log.read_text(encoding="utf-8"),
        )

    def test_api_uses_requested_record_page(self):
        result = self._run_api("records", "zone-1", "2")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(
            "/zones/zone-1/dns_records?page=2&per_page=50",
            self.curl_log.read_text(encoding="utf-8"),
        )

    def test_api_rejects_invalid_page_with_standard_error_schema(self):
        result = self._run_api("zones", "invalid")
        self.assertNotEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertFalse(payload["success"])
        self.assertEqual(payload["errors"][0]["code"], "PAGE_INVALID")

    def test_frontend_contains_pagination_and_dirty_record_contracts(self):
        source = OVERVIEW.read_text(encoding="utf-8")
        self.assertIn("function fetchAllPages", source)
        self.assertIn("response.page !== page", source)
        self.assertIn("page < response.totalPages", source)
        self.assertIn("fetchAllPages([ 'zones' ])", source)
        self.assertIn("fetchAllPages([ 'records', zone.id ])", source)
        self.assertIn("uci.set('cloudflareapi', 'settings', 'last_ip', '')", source)


if __name__ == "__main__":
    unittest.main(verbosity=1)
