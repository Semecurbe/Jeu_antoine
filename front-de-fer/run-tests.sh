#!/usr/bin/env bash
# Lance la suite de tests de Front de Fer dans Chrome headless.
set -euo pipefail
cd "$(dirname "$0")"
{ echo '<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}</style></head><body>'; cat front-de-fer.html; echo '<script>'; cat tests.js; echo '</script></body></html>'; } > .test-page.html
timeout 120 google-chrome --headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage --virtual-time-budget=20000 --dump-dom "file://$PWD/.test-page.html" 2>/dev/null \
| python3 -c '
import sys,re,html
d=sys.stdin.read(); m=re.search(r"<pre id=\"test-results\">(.*?)</pre>",d,re.S)
r=html.unescape(m.group(1)) if m else "NO RESULTS"
print(r); sys.exit(0 if m and " 0 failed" in r else 1)'
