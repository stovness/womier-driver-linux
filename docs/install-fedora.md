# Fedora, Bazzite, Nobara, RHEL

There are two routes depending on whether your system is traditional or
image-based ("atomic").

## 1. Download

From the [Releases page](../releases/latest):

```
womier-driver-3.2.19-1.x86_64.rpm
```

## 2A. Fedora Workstation, Nobara, RHEL

Double-click the file and install it from the software centre, or use the
terminal:

```sh
cd ~/Downloads
sudo dnf install ./womier-driver-3.2.19-1.x86_64.rpm
```

## 2B. Bazzite, Silverblue, Kinoite and other atomic systems

These systems do not allow normal package installs. Layer the package instead:

```sh
cd ~/Downloads
sudo rpm-ostree install ./womier-driver-3.2.19-1.x86_64.rpm
systemctl reboot
```

The app and its device permission rule become available after the reboot.

## 3. First run

1. Plug the keyboard in by USB.
2. Open **WOMIER Driver**.
3. Click **Install driver** and wait for the ~100 MB download. The keyboard
   window opens when it finishes.

## 4. Check it works

The left side should list **SK75 TMR**. Click a key; its settings open.

## If the keyboard is not detected

```sh
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=hidraw
lsusb | grep 3151
```

Replug the keyboard after the reload. On atomic systems, reboot once after
installing so the udev rule is picked up.

## Uninstall

```sh
# Fedora / Nobara / RHEL
sudo dnf remove womier-driver

# Bazzite / Silverblue
sudo rpm-ostree uninstall womier-driver
systemctl reboot
```

Then remove your settings:

```sh
rm -rf ~/.config/"WOMIER Driver"
```

More help: [Troubleshooting](troubleshooting.md).
