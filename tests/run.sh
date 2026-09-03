#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

find "$ROOT/root" -type f \( \
    -path '*/bin/*' -o \
    -path '*/libexec/*' -o \
    -path '*/init.d/*' -o \
    -path '*/uci-defaults/*' \
\) -exec sh -n {} \;

if command -v node >/dev/null 2>&1; then
    node --check "$ROOT/htdocs/luci-static/resources/view/cloudflareapi/overview.js"
    node "$ROOT/tests/test_frontend.js"
fi

python3 - "$ROOT" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
for path in root.rglob("*.json"):
    json.loads(path.read_text(encoding="utf-8"))
PY

python3 "$ROOT/tests/test_cloudflareapi.py"
printf 'All luci-app-cloudflareapi tests passed.\n'
