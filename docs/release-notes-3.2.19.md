# WOMIER Driver for Linux 3.2.19

The official WOMIER keyboard software, running natively on Linux. Key
remapping, lighting, magnetic switch settings, rapid trigger and profiles, with
the vendor's own interface.

Tested on the WOMIER SK75 TMR (USB `3151:5030`).

## Downloads

- `womier-driver_3.2.19-1_amd64.deb` for Ubuntu, Linux Mint, Pop!_OS, Zorin and Debian 12+
- `womier-driver-3.2.19-1-x86_64.pkg.tar.zst` for Arch, Manjaro, EndeavourOS, CachyOS, Garuda
- `womier-driver-3.2.19-1.x86_64.rpm` for Fedora, Nobara, Bazzite, RHEL
- `womier-driver-3.2.19-x86_64.AppImage` for any other distribution

Not sure which one? The [README](https://github.com/stovness/womier-driver-linux/blob/main/README.md) has a one-line chooser, and each
format has a step-by-step guide in [docs/](https://github.com/stovness/womier-driver-linux/tree/main/docs).

## First run

1. Plug the keyboard in with the USB cable.
2. Open **WOMIER Driver**.
3. Click **Install driver**. It downloads the official WOMIER installer
   (about 100 MB) and prepares it. This is a one-time step.
4. The keyboard settings open.

The packages do not contain WOMIER's software. Setup downloads it from
WOMIER's published link, on your machine, and never redistributes it.

## What works

- Key remapping and layers
- Lighting and effects
- Magnetic switch travel, rapid trigger, deadzone, per-key settings
- Profiles and macros, stored locally

## What does not

WOMIER's Windows background services are missing, so firmware updates and
screen-capture lighting show an error instead of pretending to work.

## Requirements

- 64-bit x86, glibc 2.31 or newer
- X11 or Wayland
- A USB cable for the first setup

## Checksums

Attached to this release as `SHA256SUMS`, one line per file.

## Support

[Troubleshooting](https://github.com/stovness/womier-driver-linux/blob/main/docs/troubleshooting.md), and the log at
`~/.cache/womier-driver.log`.
