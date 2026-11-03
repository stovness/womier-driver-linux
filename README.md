# WOMIER Driver for Linux

Run the official WOMIER keyboard software on Linux: key remapping, lighting,
magnetic switch settings, rapid trigger and profiles, using the vendor's own
interface.

Unofficial community port. Not affiliated with WOMIER.

Tested with the **WOMIER SK75 TMR** (USB `3151:5030`) on Ubuntu 24.04, Debian 12,
Fedora 45 and Arch Linux. The AppImage was tested on Ubuntu 24.04.

## Which file do I need?

| Your system | Download | Guide |
| --- | --- | --- |
| Ubuntu, Linux Mint, Pop!_OS, Zorin, elementary | `.deb` | [Ubuntu and Mint](docs/install-ubuntu-mint.md) |
| Debian 12 or newer | `.deb` | [Debian](docs/install-debian.md) |
| Arch, Manjaro, EndeavourOS, CachyOS, Garuda | `.pkg.tar.zst` | [Arch and friends](docs/install-arch.md) |
| Fedora, Bazzite, Nobara, RHEL | `.rpm` | [Fedora](docs/install-fedora.md) |
| Anything else | `.AppImage` | [AppImage](docs/install-appimage.md) |

All files are on the [Releases page](https://github.com/stovness/womier-driver-linux/releases/latest).

## What happens on first run

The package does **not** contain WOMIER's application. On first launch you get
a small setup window:

1. **Install driver** downloads the official WOMIER installer (about 100 MB)
   from the vendor's own link, unpacks it and prepares it for Linux.
2. **Allow keyboard access** adds the device permission rule. The `.deb`,
   `.rpm` and Arch packages do this for you, so the button is only needed with
   the AppImage.
3. The keyboard software opens. Plug the keyboard in by USB the first time;
   wireless works afterwards.

This is a one-time step. Later launches go straight to the keyboard settings.

## If something goes wrong

- [Troubleshooting](docs/troubleshooting.md)
- Logs: `~/.cache/womier-driver.log`
- Re-run setup: delete `~/.config/WOMIER Driver/vendor` and start the app again

## What works

- Key remapping and layers
- Lighting and effects
- Magnetic switch travel, rapid trigger, deadzone and per-key settings
- Profiles and macros (stored locally)

## What does not work

WOMIER's Windows-only background services are missing, so these show an error
instead of pretending to work:

- Firmware updates
- Screen capture lighting and music sync
- Vendor cloud features

## How it works

The vendor UI is an Electron app whose HID layer is a Windows service. On
Linux the same UI runs with its built-in browser HID path (WebHID), and a small
local service answers the bookkeeping calls it makes. Two one-line patches to
the vendor bundle are applied automatically during setup.

More detail: [How it works](docs/how-it-works.md).

## Uninstall

```sh
# Ubuntu / Debian
sudo apt remove womier-driver

# Fedora
sudo dnf remove womier-driver

# Arch
sudo pacman -R womier-driver
```

AppImage: delete the file. Then remove your settings:

```sh
rm -rf ~/.config/"WOMIER Driver" ~/.cache/womier-driver.log
```

## Licence

The Linux wrapper in this repository is MIT licensed. WOMIER's application is
proprietary and is never redistributed here: the setup window downloads it from
the vendor's own link, on your machine. You need your own copy of the WOMIER
software to use this. The application icon is WOMIER's and is used only to
identify the app.

## Building from source

See [How it works](docs/how-it-works.md#building) and the scripts in `build/`.
