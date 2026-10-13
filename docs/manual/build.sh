#!/usr/bin/env bash
# Render the manuals to searchable PDFs with bookmarks, using the Chrome on this Mac.
# Output goes to the app's static folder (served at /manual/...) and to docs/manual/.
#   docs/manual/build.sh            # both manuals
#   docs/manual/build.sh mentor     # one of: mentor, admin
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUTDIR="$ROOT/apps/product/public/manual"
mkdir -p "$OUTDIR"
build() {
  local src="$HERE/$1-manual.html" out="$OUTDIR/$2"
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --generate-pdf-document-outline \
    --virtual-time-budget=8000 --print-to-pdf="$out" "file://$src" 2>/dev/null
  cp "$out" "$HERE/$2"
  echo "built $out ($(du -h "$out" | cut -f1))"
}
which="${1:-all}"
[ "$which" = all ] || [ "$which" = mentor ] && build mentor FLP-Mentor-Service-User-Manual.pdf
[ "$which" = all ] || [ "$which" = admin ] && build admin FLP-Admin-User-Manual.pdf
true
