#!/usr/bin/env bash
# Builds an RPM from the tree staged by build-deb.sh.
set -euo pipefail

VERSION="${VERSION:-3.2.19}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$HERE/build"
STAGE="$BUILD/deb-root"
OUT="$HERE/release"
TOP="$BUILD/rpm"

[ -d "$STAGE/opt/womier-driver" ] || { echo "run build-deb.sh first" >&2; exit 1; }
command -v rpmbuild > /dev/null || { echo "rpmbuild is required" >&2; exit 1; }

rm -rf "$TOP"
mkdir -p "$TOP"/{SOURCES,SPECS,BUILD,RPMS,SRPMS}

tar -C "$STAGE" -czf "$TOP/SOURCES/womier-payload.tar.gz" opt usr

cat > "$TOP/SPECS/womier-driver.spec" << EOF
%global debug_package %{nil}
%global __os_install_post %{nil}

Name:           womier-driver
Version:        $VERSION
Release:        1%{?dist}
Summary:        WOMIER keyboard driver for Linux
License:        Proprietary
URL:            https://github.com/
Source0:        womier-payload.tar.gz
BuildArch:      x86_64
Requires:       /usr/bin/7z

%description
Runs the official WOMIER keyboard software on Linux.

The first launch downloads the vendor's Windows installer, unpacks it and
applies the small changes needed for Linux. Key remapping, lighting, magnetic
switch settings and profiles work as they do on Windows.

%prep
%setup -q -c -T
tar -xzf %{_sourcedir}/womier-payload.tar.gz

%install
mkdir -p %{buildroot}
cp -a opt usr %{buildroot}/
install -Dm644 /dev/null %{buildroot}/usr/lib/udev/rules.d/60-womier.rules
cat > %{buildroot}/usr/lib/udev/rules.d/60-womier.rules << 'RULE'
# WOMIER SK75 TMR
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3151", ATTRS{idProduct}=="5030", MODE="0660", TAG+="uaccess"
RULE

%post
udevadm control --reload-rules || :
udevadm trigger --subsystem-match=hidraw || :
update-desktop-database -q /usr/share/applications || :
gtk-update-icon-cache -q /usr/share/icons/hicolor || :

%postun
udevadm control --reload-rules || :
udevadm trigger --subsystem-match=hidraw || :

%files
/opt/womier-driver
/usr/bin/womier-driver
/usr/share/applications/womier-driver.desktop
/usr/share/icons/hicolor/512x512/apps/womier-driver.png
/usr/lib/udev/rules.d/60-womier.rules
/usr/share/doc/womier-driver
EOF

rpmbuild --define "_topdir $TOP" -bb "$TOP/SPECS/womier-driver.spec" > "$BUILD/rpmbuild.log" 2>&1 || {
  tail -30 "$BUILD/rpmbuild.log" >&2
  exit 1
}

mkdir -p "$OUT"
cp "$TOP/RPMS/x86_64/womier-driver-$VERSION-1"*.rpm "$OUT/" 2> /dev/null || true
ls -lh "$OUT"/womier-driver-*.rpm
