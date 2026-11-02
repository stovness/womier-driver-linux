#!/usr/bin/env bash
# Builds a portable AppImage from the tree staged by build-deb.sh.
set -euo pipefail

VERSION="${VERSION:-3.2.19}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$HERE/build"
STAGE="$BUILD/deb-root"
OUT="$HERE/release"
APPDIR="$BUILD/AppDir"
CACHE="$BUILD/cache"
TOOL="$CACHE/appimagetool-x86_64.AppImage"

[ -d "$STAGE/opt/womier-driver" ] || { echo "run build-deb.sh first" >&2; exit 1; }
command -v mksquashfs > /dev/null || { echo "mksquashfs is required (squashfs-tools)" >&2; exit 1; }

rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin" "$APPDIR/usr/lib"
cp -a "$STAGE/opt/womier-driver" "$APPDIR/usr/lib/womier-driver"

cat > "$APPDIR/usr/bin/womier-driver" << 'EOF'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/../lib/womier-driver/electron/electron" --no-sandbox "$@" "$HERE/../lib/womier-driver"
EOF
chmod 755 "$APPDIR/usr/bin/womier-driver"

cat > "$APPDIR/AppRun" << 'EOF'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/bin/womier-driver" "$@"
EOF
chmod 755 "$APPDIR/AppRun"

ICON="$HERE/assets/icon.png"
[ -f "$ICON" ] || ICON="$HERE/company/company_WOMIER/icon.png"
[ -f "$ICON" ] && cp -a "$ICON" "$APPDIR/womier-driver.png"

cat > "$APPDIR/womier-driver.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Name=WOMIER Driver
Comment=Configure WOMIER keyboards
Exec=womier-driver
Icon=womier-driver
Terminal=false
Categories=Settings;HardwareSettings;
EOF

mkdir -p "$CACHE"
if [ ! -x "$TOOL" ]; then
  curl -fL --retry 3 -o "$TOOL" \
    "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"
  chmod +x "$TOOL"
fi

mkdir -p "$OUT"
ARCH=x86_64 "$TOOL" --appimage-extract-and-run --no-appstream "$APPDIR" \
  "$OUT/womier-driver-$VERSION-x86_64.AppImage"
echo "built $OUT/womier-driver-$VERSION-x86_64.AppImage ($(du -h "$OUT/womier-driver-$VERSION-x86_64.AppImage" | cut -f1))"
