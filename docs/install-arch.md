# Arch, Manjaro, EndeavourOS, CachyOS, Garuda

The Arch package installs to `/opt`, pulls its dependencies from the official
repositories, and sets up the device permission rule.

## 1. Download

From the [Releases page](../releases/latest):

```
womier-driver-3.2.19-1-x86_64.pkg.tar.zst
```

## 2. Install

```sh
cd ~/Downloads
sudo pacman -U womier-driver-3.2.19-1-x86_64.pkg.tar.zst
```

`pacman` installs `p7zip` and the Electron libraries if you do not have them.

## 3. First run

1. Plug the keyboard in by USB.
2. Start **WOMIER Driver** from the applications menu, or run:

   ```sh
   womier-driver
   ```

3. Click **Install driver** and wait. The vendor installer is about 100 MB.

## 4. Check it works

The device list on the left should show **SK75 TMR**. Click a key to edit it.

## If the keyboard is not detected

The package installs this rule:

```
/usr/lib/udev/rules.d/60-womier.rules
```

Reload it and replug the keyboard:

```sh
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=hidraw
```

Check the device is present and accessible:

```sh
lsusb | grep 3151
ls -l /dev/hidraw*
```

The SK75 shows up as three `hidraw` nodes. The one used by the driver should be
owned by your user or carry an ACL for your user (`+` in `ls -l`).

## Updating

Download the newer package and install it the same way with `pacman -U`.

## Uninstall

```sh
sudo pacman -R womier-driver
rm -rf ~/.config/"WOMIER Driver"
```

More help: [Troubleshooting](troubleshooting.md).
