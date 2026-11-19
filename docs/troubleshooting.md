# Troubleshooting

## First: read the log

Every launch writes to:

```
~/.cache/womier-driver.log
```

Open it while the app is running:

```sh
tail -f ~/.cache/womier-driver.log
```

The lines that matter start with `[womier]`. Device detection looks like:

```
[womier] device permission: 12625 20528        SK75 TMR
[womier] [renderer] HID        SK75 TMR 12625:20528 open() ok
```

If those lines never appear, the app is not reaching the keyboard. That is
almost always a permissions problem.

## The keyboard is not listed

1. **Use the cable.** Wireless dongles and Bluetooth are not supported for
   setup or calibration. Plug the keyboard in directly.
2. **Check the device is seen by the system:**

   ```sh
   lsusb | grep 3151
   ```

   You should see `ID 3151:5030 SK75 TMR`.

3. **Reload the permission rule:**

   ```sh
   sudo udevadm control --reload-rules
   sudo udevadm trigger --subsystem-match=hidraw
   ```

   Unplug and replug the keyboard.

4. **Check the hidraw nodes:**

   ```sh
   ls -l /dev/hidraw*
   ```

   The SK75 creates three. The driver uses the one with usage page `0xFF00`
   (a 64-byte feature report interface). The node must be writable by your
   user, or have an ACL (`+` in `ls -l`). If all are `crw------- root root`,
   the rule did not run.

5. **AppImage only:** open the setup window and click **Allow keyboard access**.
   It asks for your password and installs the rule.

6. **Close anything else that talks to the keyboard.** A Windows VM, a Wine
   install of the vendor driver, or another copy of this app can hold the
   vendor interface. Only one program can use it at a time. Check:

   ```sh
   ss -ltnp | grep 6015
   ```

   If something is listening there and the app is not running, kill it.

## The setup download fails

Click **I already have the installer** and pick the file you downloaded from
the WOMIER software page. The setup accepts the `.exe` exactly as shipped by
WOMIER.

The automatic download uses the vendor's Google Drive link. Corporate networks
and some VPNs block it.

## "7-Zip is not installed"

The packages depend on `p7zip-full`, so this only happens with the AppImage or
a manual install:

```sh
# Ubuntu / Debian
sudo apt install p7zip-full

# Fedora
sudo dnf install p7zip

# Arch
sudo pacman -S p7zip
```

## The window is blank or white

The app needs working graphics. On very new GPUs, in VMs, or over remote
desktop, Chromium's GPU process can fail. Start it once with GPU disabled:

```sh
# installed package
womier-driver --disable-gpu

# AppImage
./womier-driver-3.2.19-x86_64.AppImage --disable-gpu
```

If that fixes it, the log will contain `GPU process isn't usable`. You can make
it permanent by editing `/usr/bin/womier-driver` and adding `--disable-gpu` to
the `exec` line.

## "Firmware update" or screen lighting shows an error

Expected. Those features use WOMIER's Windows background services, which do
not exist on Linux. Everything else (keys, lighting, magnetic settings,
profiles, macros) works.

## Setup says the app version is not supported

The Linux port patches two lines in the vendor bundle. A new WOMIER release can
move those lines. When that happens setup stops with a clear message instead of
producing a broken install.

Options:

- Download an older installer (3.2.19) using **I already have the installer**
- Open an issue with the version number from the WOMIER installer

## Start setup again

```sh
rm -rf ~/.config/"WOMIER Driver/vendor"
```

The next launch shows the setup window.

## Collect information for a bug report

```sh
cat /etc/os-release | head -3
lsusb | grep 3151
ls -l /dev/hidraw*
tail -80 ~/.cache/womier-driver.log
```

Paste that into the issue. It answers most questions immediately.

## Completely remove everything

```sh
sudo apt remove womier-driver      # or: sudo dnf remove, sudo pacman -R
sudo rm -f /etc/udev/rules.d/60-womier.rules
sudo udevadm control --reload-rules
rm -rf ~/.config/"WOMIER Driver" ~/.cache/womier-driver.log
```
