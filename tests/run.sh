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

if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys' >/dev/null 2>&1; then
    PYTHON=python3
elif command -v python >/dev/null 2>&1 && python -c 'import sys' >/dev/null 2>&1; then
    PYTHON=python
else
    printf 'Python 3 is required to run the tests.\n' >&2
    exit 1
fi

"$PYTHON" - "$ROOT" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
for path in root.rglob("*.json"):
    json.loads(path.read_text(encoding="utf-8"))
PY

"$PYTHON" "$ROOT/tests/test_cloudflareapi.py"
printf 'All luci-app-cloudflareapi tests passed.\n'
