#!/usr/bin/env bash
# Render the mentor manual to a searchable PDF with bookmarks, using the Chrome on this Mac.
# Output goes to the app's static folder (served at /manual/...) and to docs/manual/.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="$ROOT/apps/product/public/manual/FLP-Mentor-Service-User-Manual.pdf"
mkdir -p "$(dirname "$OUT")"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --generate-pdf-document-outline \
  --virtual-time-budget=8000 --print-to-pdf="$OUT" "file://$HERE/mentor-manual.html" 2>/dev/null
cp "$OUT" "$HERE/FLP-Mentor-Service-User-Manual.pdf"
echo "built $OUT ($(du -h "$OUT" | cut -f1))"
