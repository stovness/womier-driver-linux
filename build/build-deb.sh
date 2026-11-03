#!/usr/bin/env bash
# Builds dist/womier-driver_<version>_amd64.deb.
#
# The package contains the Linux shell and its own Electron runtime. It does
# NOT contain WOMIER's application: the setup window downloads the official
# installer on first run (or the user points it at a file they already have).
set -euo pipefail

VERSION="${VERSION:-3.2.19}"
ELECTRON_VERSION="${ELECTRON_VERSION:-32.3.3}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$HERE/build"
ROOT="$BUILD/deb-root"
CACHE="$BUILD/cache"
OUT="$HERE/release"
PKG="womier-driver"

command -v dpkg-deb > /dev/null || { echo "dpkg-deb is required" >&2; exit 1; }
command -v curl > /dev/null || { echo "curl is required" >&2; exit 1; }
command -v unzip > /dev/null || { echo "unzip is required" >&2; exit 1; }

echo "== clean"
rm -rf "$ROOT"
mkdir -p "$ROOT/DEBIAN" \
  "$ROOT/opt/$PKG/scripts" \
  "$ROOT/usr/bin" \
  "$ROOT/usr/share/applications" \
  "$ROOT/usr/share/icons/hicolor/512x512/apps" \
  "$ROOT/usr/lib/udev/rules.d" \
  "$ROOT/usr/share/doc/$PKG"

cat > "$ROOT/usr/lib/udev/rules.d/60-womier.rules" << 'RULE'
# WOMIER SK75 TMR
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3151", ATTRS{idProduct}=="5030", MODE="0660", TAG+="uaccess"
RULE

echo "== electron $ELECTRON_VERSION"
ZIP="$CACHE/electron-v$ELECTRON_VERSION-linux-x64.zip"
mkdir -p "$CACHE"
if [ ! -f "$ZIP" ]; then
  curl -fL --retry 3 -o "$ZIP" \
    "https://github.com/electron/electron/releases/download/v$ELECTRON_VERSION/electron-v$ELECTRON_VERSION-linux-x64.zip"
fi
mkdir -p "$ROOT/opt/$PKG/electron"
unzip -q "$ZIP" -d "$ROOT/opt/$PKG/electron"

echo "== shell"
cp -a "$HERE/main.js" "$HERE/iot-service.js" "$HERE/preload-diag.js" "$HERE/setup.html" \
  "$HERE/package.json" "$ROOT/opt/$PKG/"
cp -a "$HERE/scripts/patch-app.js" "$ROOT/opt/$PKG/scripts/"

echo "== dependencies"
# Only @electron/remote is needed at runtime. --omit=peer matters: npm would
# otherwise install Electron itself (a peer of @electron/remote), and its
# extract-zip tree ships native modules for ARM and musl, which rpmbuild then
# records as requirements.
( cd "$ROOT/opt/$PKG" \
  && node -e "const fs=require('fs');const p=require('./package.json');delete p.devDependencies;fs.writeFileSync('package.json',JSON.stringify(p,null,2))" \
  && npm install --omit=dev --omit=peer --no-audit --no-fund > /dev/null \
  && rm -rf node_modules/electron node_modules/.bin/electron )

echo "== launcher"
cat > "$ROOT/usr/bin/$PKG" << 'EOF'
#!/bin/sh
# WOMIER Driver - Linux launcher
LOG_DIR="${XDG_CACHE_HOME:-$HOME/.cache}"
mkdir -p "$LOG_DIR"
exec /opt/womier-driver/electron/electron --no-sandbox "$@" /opt/womier-driver >> "$LOG_DIR/womier-driver.log" 2>&1
EOF
chmod 755 "$ROOT/usr/bin/$PKG"

echo "== desktop entry"
cat > "$ROOT/usr/share/applications/$PKG.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Name=WOMIER Driver
Comment=Configure WOMIER keyboards
Exec=/usr/bin/womier-driver
Icon=womier-driver
Terminal=false
Categories=Settings;HardwareSettings;
StartupNotify=true
EOF

ICON="$HERE/assets/icon.png"
[ -f "$ICON" ] || ICON="$HERE/company/company_WOMIER/icon.png"
if [ -f "$ICON" ]; then
  cp -a "$ICON" "$ROOT/usr/share/icons/hicolor/512x512/apps/womier-driver.png"
else
  echo "warning: no icon found, the menu entry will use a generic one" >&2
fi

echo "== docs"
cp -a "$HERE/README.md" "$ROOT/usr/share/doc/$PKG/README.md"

echo "== control"
INSTALLED_SIZE="$(du -sk "$ROOT" | cut -f1)"
cat > "$ROOT/DEBIAN/control" << EOF
Package: $PKG
Version: $VERSION-1
Section: utils
Priority: optional
Architecture: amd64
Installed-Size: $INSTALLED_SIZE
Maintainer: Steven <stov@stov.uk>
Depends: p7zip-full, libgtk-3-0t64 | libgtk-3-0, libnss3, libnspr4, libatk1.0-0t64 | libatk1.0-0, libatk-bridge2.0-0t64 | libatk-bridge2.0-0, libcups2t64 | libcups2, libdrm2, libxkbcommon0, libxcomposite1, libxdamage1, libxfixes3, libxrandr2, libgbm1, libpango-1.0-0t64 | libpango-1.0-0, libcairo2, libasound2t64 | libasound2, libatspi2.0-0t64 | libatspi2.0-0, libx11-xcb1, libxcb-dri3-0, libsecret-1-0, libnotify4, libxtst6
Description: WOMIER Driver for Linux
 Runs the official WOMIER keyboard software on Linux.
 .
 The first launch downloads the vendor's Windows installer, unpacks it and
 applies the small changes needed for Linux. Your keyboard stays supported by
 the vendor's own UI: key remapping, lighting, magnetic switch settings and
 profiles all work as they do on Windows.
 .
 Keyboard access is granted by a udev rule installed with this package.
EOF

echo "== scripts"
cat > "$ROOT/DEBIAN/postinst" << 'EOF'
#!/bin/sh
set -e

if command -v udevadm > /dev/null; then
  udevadm control --reload-rules || true
  udevadm trigger --subsystem-match=hidraw || true
fi

if command -v update-desktop-database > /dev/null; then
  update-desktop-database -q /usr/share/applications || true
fi
if command -v gtk-update-icon-cache > /dev/null; then
  gtk-update-icon-cache -q /usr/share/icons/hicolor || true
fi

exit 0
EOF

cat > "$ROOT/DEBIAN/postrm" << 'EOF'
#!/bin/sh
set -e

if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
  if command -v udevadm > /dev/null; then
    udevadm control --reload-rules || true
    udevadm trigger --subsystem-match=hidraw || true
  fi
  if command -v update-desktop-database > /dev/null; then
    update-desktop-database -q /usr/share/applications || true
  fi
fi

exit 0
EOF
chmod 755 "$ROOT/DEBIAN/postinst" "$ROOT/DEBIAN/postrm"

echo "== package"
mkdir -p "$OUT"
DEB="$OUT/${PKG}_${VERSION}-1_amd64.deb"
dpkg-deb --root-owner-group -Zxz --build "$ROOT" "$DEB" > /dev/null
echo "built $DEB ($(du -h "$DEB" | cut -f1))"
