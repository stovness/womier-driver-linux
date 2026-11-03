#!/usr/bin/env bash
# Installs the package in a throwaway container of the target distribution and
# checks that it launches far enough to load the vendor UI.
#
# usage: test-distro.sh <image> <package> <deb|rpm> [full|quick]
set -u

IMAGE="$1"
PKG="$2"
TYPE="$3"
MODE="${4:-full}"
INST="${WOMIER_INSTALLER:-/root/Downloads/WOMIER_setup_3.2.19_WIN20260513(2).exe}"
NAME="womier-test-$(echo "$IMAGE" | tr ':/.' '___')"
PKG="$(readlink -f "$PKG")"
INST="$(readlink -f "$INST")"
BASE="$(basename "$PKG")"

[ -f "$PKG" ] || { echo "no package at $PKG"; exit 1; }
[ -f "$INST" ] || { echo "no installer at $INST (set WOMIER_INSTALLER)"; exit 1; }

cleanup() { docker rm -f "$NAME" > /dev/null 2>&1; }
trap cleanup EXIT
cleanup

echo "=== $IMAGE ($TYPE, $MODE) ==="
docker run -d --name "$NAME" \
  -v "$PKG":/tmp/"$BASE":ro \
  -v "$INST":/tmp/installer.exe:ro \
  "$IMAGE" sleep infinity > /dev/null || { echo "container failed"; exit 1; }

if [ "$TYPE" = deb ]; then
  docker exec "$NAME" sh -c "export DEBIAN_FRONTEND=noninteractive; apt-get update -qq > /tmp/pkg.log 2>&1; apt-get install -y /tmp/$BASE >> /tmp/pkg.log 2>&1; echo \"install rc=\$?\"; tail -4 /tmp/pkg.log"
else
  docker exec "$NAME" sh -c "dnf install -y /tmp/$BASE > /tmp/pkg.log 2>&1; echo \"install rc=\$?\"; tail -4 /tmp/pkg.log"
fi

echo "--- files ---"
docker exec "$NAME" sh -c 'ls -l /usr/bin/womier-driver /usr/lib/udev/rules.d/60-womier.rules /usr/share/applications/womier-driver.desktop 2>&1 | sed "s/^/  /"'

echo "--- shared libraries ---"
docker exec "$NAME" sh -c 'ldd /opt/womier-driver/electron/electron 2>&1 | grep "not found" | sed "s/^/  MISSING /" || echo "  all resolved"'

echo "--- electron version ---"
docker exec "$NAME" sh -c '/opt/womier-driver/electron/electron --no-sandbox --version 2>&1 | tail -2 | sed "s/^/  /"'

if [ "$MODE" = full ]; then
  echo "--- app launch ---"
  if [ "$TYPE" = deb ]; then
    docker exec "$NAME" sh -c 'export DEBIAN_FRONTEND=noninteractive; apt-get install -y xvfb > /tmp/xvfb.log 2>&1'
  else
    docker exec "$NAME" sh -c 'dnf install -y xorg-x11-server-Xvfb > /tmp/xvfb.log 2>&1'
  fi
  docker exec "$NAME" sh -c '
    rm -rf /tmp/wd ~/.cache/womier-driver.log
    WOMIER_USER_DATA=/tmp/wd WOMIER_INSTALLER=/tmp/installer.exe WOMIER_AUTO_INSTALL=1 WOMIER_DIAG=1 \
      timeout 200 xvfb-run -a /usr/bin/womier-driver --disable-gpu > /dev/null 2>&1
    L=~/.cache/womier-driver.log
    echo -n "  setup: "; grep -a "setup:" $L 2>/dev/null | tail -1 | sed "s/.*message/ message/"
    echo -n "  renderer: "; grep -a "renderer loaded" $L 2>/dev/null | tail -1 || echo "not reached"
    echo -n "  errors: "; grep -acE "install failed|UNHANDLED|FAILED" $L 2>/dev/null || true
    if grep -qa "\"phase\":\"done\"" $L 2>/dev/null && grep -qa "renderer loaded" $L 2>/dev/null && ! grep -qaE "install failed|UNHANDLED|FAILED" $L 2>/dev/null; then
      echo "  RESULT: PASS"
    else
      echo "  RESULT: FAIL"
      exit 1
    fi
  '
fi
