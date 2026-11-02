#!/usr/bin/env bash
# End-to-end test of the packaged .deb: unpack it, run the setup flow against
# the local installer copy, then check the vendor UI loaded and reached the
# keyboard over WebHID.
set -u

DEB="${1:?usage: test-deb.sh /path/to/womier-driver_*.deb}"
INST="${WOMIER_INSTALLER:-$HOME/Downloads/WOMIER_setup_3.2.19_WIN20260513(2).exe}"
ROOT=/tmp/womier-debroot
DATA=/tmp/womier-fresh
LOG=/tmp/womier-deb-test.log

[ -f "$DEB" ] || { echo "no deb at $DEB"; exit 1; }
[ -f "$INST" ] || { echo "no installer at $INST"; exit 1; }

rm -rf "$ROOT" "$DATA"
mkdir -p "$ROOT" "$DATA"
if command -v dpkg-deb > /dev/null; then
  dpkg-deb -x "$DEB" "$ROOT"
else
  ( cd "$ROOT" && ar x "$DEB" )
  DATA_TAR="$(ls "$ROOT"/data.tar.* | head -1)"
  case "$DATA_TAR" in
    *.xz) tar -xJf "$DATA_TAR" -C "$ROOT" ;;
    *.gz) tar -xzf "$DATA_TAR" -C "$ROOT" ;;
    *.zst) tar --zstd -xf "$DATA_TAR" -C "$ROOT" ;;
  esac
  rm -f "$ROOT"/data.tar.* "$ROOT"/control.tar.* "$ROOT"/debian-binary
fi
[ -x "$ROOT/opt/womier-driver/electron/electron" ] || { echo "electron missing from deb"; exit 1; }

export XDG_RUNTIME_DIR="/run/user/$(id -u)"
rm -f "$LOG"

WOMIER_USER_DATA="$DATA" \
WOMIER_INSTALLER="$INST" \
WOMIER_AUTO_INSTALL=1 \
WOMIER_DIAG=1 \
timeout 240 xvfb-run -a -s "-screen 0 1600x900x24" \
  "$ROOT/opt/womier-driver/electron/electron" "$ROOT/opt/womier-driver" --no-sandbox --disable-gpu \
  > "$LOG" 2>&1

echo "rc=$? (124 = still running at timeout, expected)"
echo "=== install flow ==="
grep -aE "setup:|renderer loaded: driver|install failed" "$LOG" | tail -12
echo "=== device ==="
grep -aE "HID .*open\(\) ok" "$LOG" | head -2
grep -ac "sendFeatureReport" "$LOG"
echo "=== vendor files ==="
[ -f "$DATA/vendor/dist/index.electron.html" ] && echo "vendor: present" || echo "vendor: MISSING"
echo "patch markers: $(grep -c 'return ia?t=!1:' "$DATA/vendor/dist/js/"index.*.js 2>/dev/null) / $(grep -c 'checkSessionId=t=>!0' "$DATA/vendor/dist/js/"index.*.js 2>/dev/null)"
echo "=== errors ==="
grep -aE "install failed|FAILED|UNHANDLED" "$LOG" | head -5
