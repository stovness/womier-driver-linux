#!/usr/bin/env bash
# Starts the app headless, runs the iot service smoke test, then stops it.
set -u
cd "$HOME/womier-linux" || exit 1

# Clear anything left over from earlier runs: the Wine-based experiment can
# still hold port 6015, and a stale Electron instance trips the single-instance
# lock and writes to the same log.
pkill -f 'iot_manager_rs.exe' 2>/dev/null || true
pkill -f 'common_hid_rs.exe' 2>/dev/null || true
pkill -f 'rhythm_service.exe' 2>/dev/null || true
pkill -f 'screen_capture_service.exe' 2>/dev/null || true
pkill -f "$HOME/womier-linux/node_modules/electron/dist/electron" 2>/dev/null || true
sleep 2

if ss -ltn 2>/dev/null | grep -q ':6015 '; then
  echo "port 6015 is still busy:"
  ss -ltnp 2>/dev/null | grep ':6015 '
  exit 1
fi

rm -f /tmp/womier.log
timeout 55 xvfb-run -a -s "-screen 0 1600x900x24" ./node_modules/.bin/electron . --no-sandbox --disable-gpu > /tmp/womier.log 2>&1 &
APP=$!
sleep 12

echo "=== service ==="
grep -aE "iot_manager service|iot service|rpc " /tmp/womier.log | head -12

echo "=== test ==="
node scripts/test-iot-service.js
RC=$?

echo "=== log tail ==="
grep -av "Fontconfig warning\|radv is not\|Security Warning\|^$\|^  \|consult\|electronjs.org\|once the app" /tmp/womier.log | tail -8

pkill -f "$HOME/womier-linux/node_modules/electron/dist/electron" 2>/dev/null || true
wait "$APP" 2>/dev/null
exit "$RC"
