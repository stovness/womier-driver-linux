# Debian 12 and newer

Same package as Ubuntu. Debian does not always ship a graphical installer for
local `.deb` files, so the terminal command below is the reliable route.

## 1. Download

From the [Releases page](https://github.com/stovness/womier-driver-linux/releases/latest):

```
womier-driver_3.2.19-1_amd64.deb
```

## 2. Install

```sh
cd ~/Downloads
sudo apt install ./womier-driver_3.2.19-1_amd64.deb
```

`apt` pulls in the libraries the app needs, including `p7zip-full` and the
usual Electron runtime libraries.

## 3. First run

1. Plug the keyboard in by USB.
2. Start **WOMIER Driver** from your applications menu, or run:

   ```sh
   womier-driver
   ```

3. Click **Install driver** in the setup window and wait for the download to
   finish. The keyboard settings window opens automatically.

## 4. Check it works

**SK75 TMR** should appear on the left. Click a key to open its settings.

## Notes for Debian

- If `apt` reports missing dependencies, run `sudo apt --fix-broken install`.
- Debian 11 and older are not supported: the bundled Electron runtime needs a
  newer glibc.

## Troubleshooting

[Troubleshooting](troubleshooting.md) covers a keyboard that is not
detected, failed downloads and log locations.

## Uninstall

```sh
sudo apt remove womier-driver
rm -rf ~/.config/"WOMIER Driver"
```
