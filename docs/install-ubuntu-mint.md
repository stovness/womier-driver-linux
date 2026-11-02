# Ubuntu, Linux Mint, Pop!_OS, Zorin, elementary

The `.deb` package installs the app, its own Electron runtime, and the device
permission rule. You do not need Node, npm or any terminal commands.

## 1. Download

Open the [Releases page](../releases/latest) and download:

```
womier-driver_3.2.19-1_amd64.deb
```

## 2. Install it

Double-click the file. Your software centre opens and shows **WOMIER Driver**.
Click **Install** and enter your password.

If double-clicking does nothing, right-click the file and choose **Open With →
Software Install**.

Terminal alternative:

```sh
sudo apt install ./womier-driver_3.2.19-1_amd64.deb
```

You should now see **WOMIER Driver** in your application menu.

## 3. First run

1. Plug the keyboard in with the USB cable.
2. Open **WOMIER Driver** from the menu.
3. Click **Install driver**. It downloads the official WOMIER installer
   (about 100 MB) and prepares it. This takes a few minutes.
4. When it says **Driver installed**, the keyboard settings window opens.

You only do this once.

## 4. Check it works

The left side of the window should list **SK75 TMR**. Click any key on the
keyboard picture; the key editor opens on the right.

## If it does not work

- Keyboard not listed: unplug and replug the USB cable, then see
  [Troubleshooting](troubleshooting.md).
- Download failed: click **I already have the installer** and choose the file
  you downloaded from the WOMIER software page.
- Logs: `~/.cache/womier-driver.log`

## Uninstall

```sh
sudo apt remove womier-driver
rm -rf ~/.config/"WOMIER Driver"
```
