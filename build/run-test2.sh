#!/usr/bin/env bash
# Runs the already-extracted test tree against an existing vendor directory.
set -u
ROOT=/tmp/womier-debroot
DATA=/tmp/womier-fresh
LOG=/tmp/womier-run2.log
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
rm -f "$LOG"
WOMIER_USER_DATA="$DATA" WOMIER_DIAG=1 \
timeout 40 xvfb-run -a -s "-screen 0 1600x900x24" \
  "$ROOT/opt/womier-driver/electron/electron" "$ROOT/opt/womier-driver" --no-sandbox --disable-gpu \
  > "$LOG" 2>&1
echo "rc=$?"
grep -aE "renderer loaded|PAGE|device permission|open\(\) ok|HID .*FAILED" "$LOG" | head -20
