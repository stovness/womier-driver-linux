#!/usr/bin/env bash
# Launcher for the WOMIER Driver Linux port.
# Starts the app detached from the terminal and logs to ~/.cache/womier-driver.log.
set -u

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${XDG_CACHE_HOME:-$HOME/.cache}"
LOG="$LOG_DIR/womier-driver.log"
mkdir -p "$LOG_DIR"

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
if [ -z "${WAYLAND_DISPLAY:-}" ] && [ -z "${DISPLAY:-}" ]; then
  export WAYLAND_DISPLAY=wayland-1
  export DISPLAY=:0
fi

if pgrep -f "$APP_DIR/node_modules/electron/dist/electron" > /dev/null 2>&1; then
  exit 0
fi

if [ ! -x "$APP_DIR/node_modules/electron/dist/electron" ]; then
  echo "Electron is missing; run scripts/install.sh again" >&2
  exit 1
fi

setsid "$APP_DIR/node_modules/.bin/electron" "$APP_DIR" --no-sandbox >> "$LOG" 2>&1 < /dev/null &
