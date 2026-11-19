# AppImage (any distribution)

Use this if your distribution is not Ubuntu, Debian, Arch or Fedora based, or
if you prefer not to install a package.

## 1. Download

From the [Releases page](https://github.com/stovness/womier-driver-linux/releases/latest):

```
womier-driver-3.2.19-x86_64.AppImage
```

## 2. Make it executable

```sh
cd ~/Downloads
chmod +x womier-driver-3.2.19-x86_64.AppImage
```

## 3. Run it

```sh
./womier-driver-3.2.19-x86_64.AppImage
```

If you see `dlopen(): error loading libfuse.so.2`, install FUSE 2:

```sh
# Ubuntu 24.04 and newer
sudo apt install libfuse2t64

# Fedora
sudo dnf install fuse-libs

# Arch
sudo pacman -S fuse2
```

Or skip FUSE entirely:

```sh
./womier-driver-3.2.19-x86_64.AppImage --appimage-extract-and-run
```

## 4. Allow keyboard access

AppImages cannot install system files on their own, so do this once:

1. In the setup window, click **Allow keyboard access**.
2. Enter your password. This writes `/etc/udev/rules.d/60-womier.rules` and
   reloads udev.

## 5. Install the driver

Click **Install driver** and wait for the ~100 MB download. The keyboard window
opens when it finishes.

## Keeping it in your menu

Move the file somewhere permanent and use your desktop's "add to menu" option,
or install [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher)
which adds a menu entry automatically:

```sh
mkdir -p ~/Applications
mv womier-driver-3.2.19-x86_64.AppImage ~/Applications/
```

## Updating

Download the new AppImage and replace the old file. Your settings are kept in
`~/.config/WOMIER Driver`.

## Uninstall

Delete the AppImage, then:

```sh
sudo rm -f /etc/udev/rules.d/60-womier.rules
sudo udevadm control --reload-rules
rm -rf ~/.config/"WOMIER Driver"
```

More help: [Troubleshooting](troubleshooting.md).
