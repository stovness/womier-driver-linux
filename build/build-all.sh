#!/usr/bin/env bash
# Builds every release artifact. Run from the repository root or anywhere.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$HERE/build-deb.sh"
"$HERE/build-arch.sh"
"$HERE/build-rpm.sh"
"$HERE/build-appimage.sh"

echo
echo "artifacts:"
ls -lh "$HERE/../release" | sed '1d'
