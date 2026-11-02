#!/usr/bin/env bash
# Installs the WOMIER Driver Linux port.
#
#   ./scripts/install.sh /path/to/WOMIER_setup.exe
#   ./scripts/install.sh /path/to/WOMIER/resources/app
#
# The vendor code is never redistributed: this script copies the files out of
# your own WOMIER installation and patches the renderer bundle in place.
#
# Env:
#   WOMIER_APP_DIR     target directory (default ~/womier-linux)
#   WOMIER_NO_DESKTOP  set to 1 to skip the application-menu entry
set -euo pipefail

die() { echo "error: $*" >&2; exit 1; }

SRC="${1:-}"
[ -n "$SRC" ] || die "usage: install.sh /path/to/WOMIER_setup.exe | /path/to/resources/app"

APP_DIR="${WOMIER_APP_DIR:-$HOME/womier-linux}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v node > /dev/null || die "node is required"
command -v npm > /dev/null || die "npm is required"

# --- locate the vendor files ---------------------------------------------

TMP=""
cleanup() { [ -n "$TMP" ] && rm -rf "$TMP"; }
trap cleanup EXIT

if [ -f "$SRC" ]; then
  command -v 7z > /dev/null || die "p7zip is required to unpack the installer (install p7zip)"
  TMP="$(mktemp -d)"
  echo "unpacking installer..."
  7z x -y -o"$TMP" "$SRC" > /dev/null
  FOUND="$(find "$TMP" -path '*/resources/app/package.json' -print -quit || true)"
  [ -n "$FOUND" ] || die "could not find resources/app inside the installer"
  SRC="$(dirname "$FOUND")"
fi

SRC="$(cd "$SRC" && pwd)"
[ -f "$SRC/package.json" ] || die "$SRC does not look like the WOMIER app directory"
if [ -d "$SRC/resources/app" ]; then SRC="$SRC/resources/app"; fi
[ -f "$SRC/dist/index.electron.html" ] || die "$SRC has no dist/index.electron.html"

SAME=0
[ "$SRC" = "$APP_DIR" ] && SAME=1

# --- install the shell ----------------------------------------------------

if [ "$SAME" -eq 0 ]; then
  mkdir -p "$APP_DIR/scripts"
  cp -a "$HERE/main.js" "$HERE/iot-service.js" "$HERE/preload-diag.js" "$HERE/package.json" "$APP_DIR/"
  cp -a "$HERE"/scripts/*.js "$HERE"/scripts/*.sh "$APP_DIR/scripts/"
  chmod +x "$APP_DIR"/scripts/*.sh
fi

if [ "$SAME" -eq 0 ]; then
  echo "copying vendor files from $SRC"
  rm -rf "$APP_DIR/dist" "$APP_DIR/company"
  cp -a "$SRC/dist" "$SRC/company" "$APP_DIR/"
  cp -a "$SRC/APPVersion.json" "$SRC/CurrentCompany.json" "$APP_DIR/" 2> /dev/null || true
else
  echo "vendor files already in place"
fi

echo "patching renderer..."
node "$APP_DIR/scripts/patch-app.js" "$APP_DIR"

# --- electron -------------------------------------------------------------

cd "$APP_DIR"
if [ ! -x node_modules/.bin/electron ]; then
  echo "installing dependencies..."
  npm install --no-audit --no-fund
fi

if [ ! -x node_modules/electron/dist/electron ]; then
  # Some distros block npm install scripts, which leaves the Electron binary
  # undownloaded. Try the package's own installer, then the download cache.
  node node_modules/electron/install.js > /dev/null 2>&1 || true
fi

if [ ! -x node_modules/electron/dist/electron ]; then
  VERSION="$(node -p "require('./node_modules/electron/package.json').version" 2> /dev/null || true)"
  command -v unzip > /dev/null || die "unzip is required to finish the Electron install"
  CACHE="${XDG_CACHE_HOME:-$HOME/.cache}"
  ZIP="$(ls -t "$CACHE"/electron/*/electron-v"$VERSION"-linux-x64.zip 2> /dev/null | head -1 || true)"
  if [ -z "$ZIP" ]; then
    [ -n "$VERSION" ] || die "Electron is not installed and its version is unknown"
    echo "downloading Electron $VERSION..."
    ZIP="$CACHE/electron-v$VERSION-linux-x64.zip"
    mkdir -p "$CACHE"
    curl -fL --retry 2 -o "$ZIP" \
      "https://github.com/electron/electron/releases/download/v$VERSION/electron-v$VERSION-linux-x64.zip"
  fi
  echo "unpacking Electron..."
  rm -rf node_modules/electron/dist
  mkdir -p node_modules/electron/dist
  unzip -q "$ZIP" -d node_modules/electron/dist
  printf '%s' electron > node_modules/electron/path.txt
  chmod +x node_modules/electron/dist/electron
fi

[ -x node_modules/electron/dist/electron ] || die "Electron still missing; delete node_modules/electron and retry"

# --- application menu entry ----------------------------------------------

if [ "${WOMIER_NO_DESKTOP:-0}" != "1" ]; then
  APPS="$HOME/.local/share/applications"
  ICONS="$HOME/.local/share/icons"
  mkdir -p "$APPS" "$ICONS"
  if [ -f "$APP_DIR/company/company_WOMIER/icon.png" ]; then
    cp -a "$APP_DIR/company/company_WOMIER/icon.png" "$ICONS/womier-driver.png"
    ICON="$ICONS/womier-driver.png"
  else
    ICON="input-keyboard"
  fi
  cat > "$APPS/womier-driver.desktop" << EOF
[Desktop Entry]
Type=Application
Name=WOMIER Driver
Comment=Configure WOMIER keyboards
Exec=$APP_DIR/scripts/launch.sh
Icon=$ICON
Terminal=false
Categories=Settings;HardwareSettings;
StartupNotify=true
EOF
  command -v update-desktop-database > /dev/null && update-desktop-database "$APPS" > /dev/null 2>&1 || true
  echo "menu entry: $APPS/womier-driver.desktop"
fi

echo
echo "installed to $APP_DIR"
echo "start it with: $APP_DIR/scripts/launch.sh"
