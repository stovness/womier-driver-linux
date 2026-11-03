# How it works

## The problem

The WOMIER Driver is an Electron UI plus Windows-only helper programs. The UI
never touches the keyboard itself on Windows: it asks a local service
(`iot_manager_rs.exe`) to send and receive 64-byte HID feature reports on the
vendor collection. On Linux that service cannot run, so the UI sits at
"Searching for Devices" even when the keyboard is plugged in. Wine does not fix
this, because Wine's HID layer does not expose the vendor interface.

## The approach

The same UI already contains a second HID backend: `navigator.hid` (WebHID),
used by the vendor's browser builds. Chromium on Linux speaks to
`/dev/hidraw*`, so pointing the UI at that backend makes the keyboard work
without reimplementing the protocol.

Three pieces make it run:

1. **Electron shell** (`main.js`)
   Runs the vendor renderer with `nodeIntegration`, serves the IPC calls it
   expects, and grants WebHID device access. Chromium's HID blocklist (which
   normally hides keyboards from WebHID) is disabled for this app only.

2. **Local service** (`iot-service.js`)
   Listens on `127.0.0.1:6015` and implements the `iot_manager.IotManager`
   gRPC-web API the UI calls: version reporting, device bookkeeping, and a
   JSON-backed key/value store for profiles, macros and light images. Hand-rolled
   protobuf, no dependencies.

3. **Two bundle patches** (`scripts/patch-app.js`)
   Applied to the vendor bundle during setup, in place, on your machine:

   ```js
   // The Windows sidecar is forced on inside Electron. Use WebHID instead.
   ia ? t = !0        ->  ia ? t = !1

   // Every service call is gated behind a session id only the Windows
   // service issues. Our service has no handshake, so open the gate.
   checkSessionId = t => this.sessionId !== void 0
                      ->  checkSessionId = t => !0
   ```

   These are the only changes to vendor code. `patch-app.js` refuses to run if
   the markers are missing, so a new vendor version fails loudly.

## Where the files live

```
/opt/womier-driver/                  the shell and its Electron runtime
~/.config/WOMIER Driver/vendor/      the vendor app, extracted during setup
~/.config/WOMIER Driver/iot_db/      profiles, macros, light images
~/.cache/womier-driver.log           log
```

The vendor files are extracted into your user data directory, not into `/opt`,
so setup does not need root. `main.js` points `app.getAppPath()` at that
directory, which is where the UI looks for its config files.

## Why the vendor app is not in the packages

WOMIER's software is proprietary. The packages here contain only the Linux
shell and its Electron runtime. Setup downloads the installer from the link
WOMIER publishes, on your machine, and extracts it locally. Nothing from
WOMIER is redistributed.

## Building

Requirements:

- Node.js and npm
- `dpkg-deb` (deb), `rpmbuild` (rpm), `bsdtar` (Arch package)
- `mksquashfs` and `curl` (AppImage)
- `unzip`

Build everything:

```sh
./build/build-all.sh
```

Artifacts land in `release/`:

```
womier-driver_3.2.19-1_amd64.deb
womier-driver-3.2.19-1-x86_64.pkg.tar.zst
womier-driver-3.2.19-1.x86_64.rpm
womier-driver-3.2.19-x86_64.AppImage
```

The build downloads the official Electron 32 runtime once and caches it in
`build/cache/`.

Individual targets: `build-deb.sh`, `build-arch.sh`, `build-rpm.sh`,
`build-appimage.sh`. They all reuse the tree staged by `build-deb.sh`, so run
that first.

## Development install

To run against an existing vendor installation without packaging:

```sh
./scripts/install.sh ~/Downloads/WOMIER_setup_3.2.19_WIN20260513.exe
./scripts/launch.sh
```

Set `WOMIER_APP_DIR` to install somewhere else. Run with `WOMIER_DIAG=1` to log
every HID call, and `WOMIER_DEVTOOLS=1` to open the Chromium devtools.

## Repository layout

```
main.js              Electron shell and setup flow
iot-service.js       local iot_manager replacement (gRPC-web over HTTP)
preload-diag.js      HID diagnostics, enabled with WOMIER_DIAG=1
setup.html           first-run window
scripts/             patcher, dev installer, launcher, service test
build/               packaging for deb, rpm, Arch, AppImage
docs/                per-distribution install guides
```

## Supported versions

The patches target WOMIER Driver **3.2.19**. Other versions may work if the
markers are still present; `patch-app.js` reports what it finds. Devices other
than the SK75 TMR are listed in the vendor's device tables (VID `0x3151`), but
only the SK75 TMR has been tested. The udev rule is specific to `3151:5030`;
other models need their own VID/PID added.
