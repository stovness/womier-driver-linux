#!/usr/bin/env bash
# Builds an Arch package (.pkg.tar.zst) from the tree staged by build-deb.sh.
# pacman installs it with: sudo pacman -U ./womier-driver-*.pkg.tar.zst
set -euo pipefail

VERSION="${VERSION:-3.2.19}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$HERE/build"
STAGE="$BUILD/deb-root"
OUT="$HERE/release"
ROOT="$BUILD/arch-root"

[ -d "$STAGE/opt/womier-driver" ] || { echo "run build-deb.sh first" >&2; exit 1; }
command -v bsdtar > /dev/null || { echo "bsdtar is required" >&2; exit 1; }

rm -rf "$ROOT"
mkdir -p "$ROOT"
cp -a "$STAGE/opt" "$STAGE/usr" "$ROOT/"
mkdir -p "$ROOT/usr/lib/udev/rules.d"
cat > "$ROOT/usr/lib/udev/rules.d/60-womier.rules" << 'RULE'
# WOMIER SK75 TMR
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3151", ATTRS{idProduct}=="5030", MODE="0660", TAG+="uaccess"
RULE

SIZE="$(du -sb "$ROOT" | cut -f1)"
cat > "$ROOT/.PKGINFO" << EOF
pkgname = womier-driver
pkgbase = womier-driver
pkgver = $VERSION-1
pkgdesc = WOMIER keyboard driver for Linux
url = https://github.com/
builddate = $(date +%s)
packager = Steven <stov@stov.uk>
size = $SIZE
arch = x86_64
license = custom
depend = p7zip
depend = glib2
depend = gtk3
depend = nss
depend = nspr
depend = dbus
depend = atk
depend = at-spi2-core
depend = libcups
depend = libdrm
depend = mesa
depend = pango
depend = cairo
depend = libx11
depend = libxcb
depend = libxcomposite
depend = libxdamage
depend = libxext
depend = libxfixes
depend = libxrandr
depend = expat
depend = libxkbcommon
depend = alsa-lib
EOF

cat > "$ROOT/.INSTALL" << 'EOF'
post_install() {
  udevadm control --reload-rules || true
  udevadm trigger --subsystem-match=hidraw || true
  update-desktop-database -q /usr/share/applications || true
  gtk-update-icon-cache -q /usr/share/icons/hicolor || true
}
post_upgrade() {
  post_install
}
post_remove() {
  udevadm control --reload-rules || true
  udevadm trigger --subsystem-match=hidraw || true
}
EOF

mkdir -p "$OUT"
PKG="$OUT/womier-driver-$VERSION-1-x86_64.pkg.tar.zst"
( cd "$ROOT" && bsdtar --zstd -cf "$PKG" .PKGINFO .INSTALL opt usr )
echo "built $PKG ($(du -h "$PKG" | cut -f1))"
