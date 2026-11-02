#!/usr/bin/env bash
# End-to-end test of the AppImage: run it against a fresh user data dir and
# the local installer copy, then check it reached the keyboard.
set -u

IMAGE="${1:?usage: test-appimage.sh /path/to/womier-driver-*.AppImage}"
INST="${WOMIER_INSTALLER:-$HOME/Downloads/WOMIER_setup_3.2.19_WIN20260513(2).exe}"
DATA=/tmp/womier-ai-test
LOG=/tmp/womier-ai-test.log

[ -f "$IMAGE" ] || { echo "no image at $IMAGE"; exit 1; }
[ -f "$INST" ] || { echo "no installer at $INST"; exit 1; }

chmod +x "$IMAGE"
rm -rf "$DATA"
mkdir -p "$DATA"
rm -f "$LOG"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

WOMIER_USER_DATA="$DATA" WOMIER_INSTALLER="$INST" WOMIER_AUTO_INSTALL=1 WOMIER_DIAG=1 \
timeout 180 xvfb-run -a -s "-screen 0 1600x900x24" \
  "$IMAGE" --appimage-extract-and-run --no-sandbox --disable-gpu > "$LOG" 2>&1

echo "rc=$? (124 = still running at timeout, expected)"
echo "=== install ==="
grep -a "setup:" "$LOG" | tail -3
echo "=== driver ==="
grep -a "renderer loaded" "$LOG" | tail -1
grep -aE "HID .*open\(\) ok" "$LOG" | head -1
echo "feature reports: $(grep -ac sendFeatureReport "$LOG")"
echo "=== errors ==="
grep -aE "install failed|FAILED|UNHANDLED" "$LOG" | head -3
