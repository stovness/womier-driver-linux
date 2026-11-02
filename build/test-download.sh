#!/usr/bin/env bash
# Tests the in-app download path: fresh user data, no local installer.
set -u
ROOT=/tmp/womier-debroot
DATA=/tmp/womier-dl-test
LOG=/tmp/womier-dl-test.log
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

rm -rf "$DATA"
mkdir -p "$DATA"
rm -f "$LOG"

WOMIER_USER_DATA="$DATA" WOMIER_AUTO_INSTALL=1 WOMIER_DIAG=1 \
timeout 420 xvfb-run -a -s "-screen 0 1600x900x24" \
  "$ROOT/opt/womier-driver/electron/electron" "$ROOT/opt/womier-driver" --no-sandbox --disable-gpu \
  > "$LOG" 2>&1
echo "rc=$?"
grep -a "setup:" "$LOG" | sed -n '1p;/download/p' | tail -6
echo "=== result ==="
grep -a "renderer loaded" "$LOG" | tail -1
grep -a "PAGE" "$LOG" | tail -1 | cut -c1-160
echo "=== device ==="
grep -ac "sendFeatureReport" "$LOG"
echo "=== installer file ==="
ls -l "$DATA/downloads/" 2>/dev/null
