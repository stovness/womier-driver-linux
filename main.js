// WOMIER Driver - Linux Electron shell
//
// Runs the vendor's renderer unchanged and supplies what it expects from
// Windows: WebHID device permissions, the handful of IPC calls it makes, and
// a local service on 127.0.0.1:6015.
//
// On first run the vendor files are not present yet, so the window shows
// setup.html: it downloads the official WOMIER installer, extracts the app,
// patches the bundle and then loads the real UI.
//
// The vendor application is proprietary; this file contains no vendor code.

const { app, BrowserWindow, ipcMain, session, screen, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const https = require('https')
const { spawn } = require('child_process')
const remoteMain = require('@electron/remote/main')
const { createService } = require('./iot-service')

remoteMain.initialize()

const WIDTH = 1595
const HEIGHT = 830
const LOG_PREFIX = '[womier]'

// Official installer. The Drive link is the one the vendor hands out for the
// SK75 TMR. confirm=t skips the large-file warning page.
const INSTALLER_URL =
  'https://drive.usercontent.google.com/download?id=1h1mesqQXKbsKgOGtTUYfKSiGgmSxpzEN&export=download&confirm=t'
const INSTALLER_SIZE = 106575448

if (process.env.WOMIER_USER_DATA) {
  app.setPath('userData', process.env.WOMIER_USER_DATA)
}

const VENDOR_DIR = path.join(app.getPath('userData'), 'vendor')
process.env.WOMIER_VENDOR_DIR = VENDOR_DIR

// The vendor UI resolves its own files (company config, APPVersion.json) from
// app.getAppPath(). Those files live in the user data directory, so point
// getAppPath() there. The override is installed after startup, before the
// window loads, and only when the vendor files are present.
const realGetAppPath = app.getAppPath.bind(app)
app.getAppPath = () => (vendorReady() ? VENDOR_DIR : realGetAppPath())

let win = null
let installing = false

function log(...args) {
  console.log(LOG_PREFIX, ...args)
}

app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-background-timer-throttling')
// Chromium blocks HID keyboard/mouse collections by default (anti-keylogger).
// The app talks to the vendor collection, but the blocklist also hides the
// device from navigator.hid in some builds, so disable it for this app.
app.commandLine.appendSwitch('disable-hid-blocklist')

// --- vendor installation --------------------------------------------------

function vendorReady() {
  return fs.existsSync(path.join(VENDOR_DIR, 'dist', 'index.electron.html'))
}

function sevenZip() {
  const candidates = [
    process.env.WOMIER_7Z,
    '/usr/bin/7z',
    '/usr/bin/7za',
    '/usr/bin/7zr',
    path.join(__dirname, 'bin', '7za'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return candidate
    } catch {
      // try the next one
    }
  }
  throw new Error('7-Zip is not installed (package p7zip-full, p7zip or 7zip)')
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (d) => (output += d.toString()))
    child.stderr.on('data', (d) => (output += d.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(output)
      else reject(new Error(`${path.basename(command)} exited ${code}: ${output.slice(-400)}`))
    })
  })
}

function send(status) {
  if (win && !win.isDestroyed()) win.webContents.send('setup:status', status)
  log('setup:', JSON.stringify(status))
}

function downloadInstaller(destination) {
  return new Promise((resolve, reject) => {
    const request = (url, redirects) => {
      https
        .get(url, { headers: { 'user-agent': 'womier-driver-linux' } }, (response) => {
          const { statusCode, headers } = response
          if (statusCode >= 300 && statusCode < 400 && headers.location) {
            response.resume()
            if (redirects <= 0) return reject(new Error('too many redirects'))
            return request(headers.location, redirects - 1)
          }
          if (statusCode !== 200) {
            response.resume()
            return reject(new Error(`download failed with HTTP ${statusCode}`))
          }

          const total = Number(headers['content-length'] || INSTALLER_SIZE)
          let received = 0
          let lastPercent = -1
          const file = fs.createWriteStream(destination)
          response.on('data', (chunk) => {
            received += chunk.length
            const percent = Math.round((received / total) * 100)
            if (percent !== lastPercent && percent % 2 === 0) {
              lastPercent = percent
              send({ phase: 'download', percent, message: `Downloading the WOMIER driver (${percent}%)` })
            }
          })
          response.pipe(file)
          file.on('finish', () => file.close(() => resolve(destination)))
          file.on('error', reject)
          response.on('error', reject)
        })
        .on('error', reject)
    }
    request(INSTALLER_URL, 5)
  })
}

function findFile(root, pattern) {
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (pattern.test(entry.name)) return full
    }
  }
  return null
}

function findAppDir(root) {
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    if (fs.existsSync(path.join(dir, 'dist', 'index.electron.html'))) return dir
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) stack.push(path.join(dir, entry.name))
    }
  }
  return null
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) copyDir(src, dst)
    else if (entry.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(src), dst)
    else fs.copyFileSync(src, dst)
  }
}

async function installFrom(installer) {
  const zip = sevenZip()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'womier-setup-'))

  send({ phase: 'extract', percent: 0, message: 'Unpacking the WOMIER driver' })
  await run(zip, ['x', '-y', `-o${path.join(tmp, 'nsis')}`, installer])
  if (win) send({ phase: 'extract', percent: 40, message: 'Unpacking the WOMIER driver' })

  const inner =
    findFile(path.join(tmp, 'nsis'), /^app-64\.7z$/i) || findFile(path.join(tmp, 'nsis'), /^app-\d+\.7z$/i)
  if (!inner) throw new Error('this installer does not contain the WOMIER app')

  await run(zip, ['x', '-y', `-o${path.join(tmp, 'app')}`, inner])
  if (win) send({ phase: 'extract', percent: 80, message: 'Unpacking the WOMIER driver' })

  const appDir = findAppDir(path.join(tmp, 'app'))
  if (!appDir) throw new Error('could not find the app inside the installer')

  send({ phase: 'install', percent: 90, message: 'Installing the driver files' })
  fs.rmSync(VENDOR_DIR, { recursive: true, force: true })
  fs.mkdirSync(VENDOR_DIR, { recursive: true })
  copyDir(path.join(appDir, 'dist'), path.join(VENDOR_DIR, 'dist'))
  if (fs.existsSync(path.join(appDir, 'company'))) {
    copyDir(path.join(appDir, 'company'), path.join(VENDOR_DIR, 'company'))
  }
  for (const name of ['APPVersion.json', 'CurrentCompany.json', 'package.json']) {
    const src = path.join(appDir, name)
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(VENDOR_DIR, name))
  }

  // The vendor renderer does a bare require('@electron/remote'), resolved
  // relative to its own directory. Give it a node_modules it can find.
  const remoteSource = path.join(__dirname, 'node_modules', '@electron', 'remote')
  if (fs.existsSync(remoteSource)) {
    const remoteTarget = path.join(VENDOR_DIR, 'node_modules', '@electron', 'remote')
    fs.mkdirSync(path.dirname(remoteTarget), { recursive: true })
    copyDir(remoteSource, remoteTarget)
  } else {
    log('warning: @electron/remote not found next to the app')
  }

  send({ phase: 'patch', percent: 96, message: 'Preparing the driver for Linux' })
  await run(process.execPath, [path.join(__dirname, 'scripts', 'patch-app.js'), VENDOR_DIR], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })

  if (!vendorReady()) throw new Error('installation finished but the app files are missing')
  fs.rmSync(tmp, { recursive: true, force: true })

  send({ phase: 'done', percent: 100, message: 'Ready' })
  return true
}

async function startInstall(sourcePath) {
  if (installing) return { ok: false, error: 'already running' }
  installing = true
  try {
    let installer = sourcePath
    if (!installer && process.env.WOMIER_INSTALLER) {
      installer = process.env.WOMIER_INSTALLER
    }
    if (!installer) {
      const dir = path.join(app.getPath('userData'), 'downloads')
      fs.mkdirSync(dir, { recursive: true })
      installer = path.join(dir, 'WOMIER_setup.exe')
      await downloadInstaller(installer)
    }
    await installFrom(installer)
    return { ok: true }
  } catch (error) {
    log('install failed:', error.stack || error)
    send({ phase: 'error', percent: 0, message: error.message })
    return { ok: false, error: error.message }
  } finally {
    installing = false
  }
}

// --- window ---------------------------------------------------------------

function setupHidPermissions() {
  const ses = session.defaultSession

  ses.setPermissionRequestHandler((wc, permission, callback) => callback(true))
  ses.setPermissionCheckHandler(() => true)

  // Called for navigator.hid.getDevices() (already-granted devices) and for
  // the chooser. Grant every HID device: this app only ever asks for its own
  // vendor collection, and the udev rule limits hidraw access to the user.
  ses.setDevicePermissionHandler((details) => {
    if (details.deviceType !== 'hid') return false
    const d = details.device || {}
    log('device permission:', d.vendorId, d.productId, d.name || '')
    return true
  })

  ses.on('select-hid-device', (event, details, callback) => {
    event.preventDefault()
    const list = details.deviceList || []
    log('select-hid-device:', list.map((d) => `${d.vendorId}:${d.productId} ${d.name}`).join(' | ') || '(empty)')
    const pick = list.find((d) => d.vendorId === 0x3151 && d.productId === 0x5030) || list[0]
    callback(pick ? pick.deviceId : '')
  })
}

function loadUi() {
  if (vendorReady()) {
    win.loadFile(path.join(VENDOR_DIR, 'dist', 'index.electron.html'))
  } else {
    win.loadFile(path.join(__dirname, 'setup.html'))
  }
}

function createWindow() {
  const display = screen.getPrimaryDisplay()
  const scale = Math.min(1, Math.round(display.size.height * 0.75) / HEIGHT)

  win = new BrowserWindow({
    width: Math.round(WIDTH * scale),
    height: Math.round(HEIGHT * scale),
    backgroundColor: '#111111',
    center: true,
    frame: false,
    resizable: true,
    fullscreenable: false,
    show: false,
    title: 'WOMIER Driver',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
      spellcheck: false,
      preload: path.join(__dirname, 'preload-diag.js'),
    },
  })

  remoteMain.enable(win.webContents)
  loadUi()

  win.once('ready-to-show', () => {
    win.show()
    win.webContents.send('ready-to-show', true)
  })

  win.webContents.on('did-finish-load', () => {
    log('renderer loaded:', vendorReady() ? 'driver' : 'setup')
    win.webContents.send('ready', true)
    if (process.env.WOMIER_DIAG === '1') {
      setTimeout(async () => {
        try {
          const info = await win.webContents.executeJavaScript(
            `({
              title: document.title,
              text: (document.body.innerText || '').slice(0, 160),
              scripts: [...document.scripts].map((s) => s.src).slice(0, 4),
              ready: document.readyState,
              errs: (window.__errs || []).slice(0, 5),
              buffer: typeof window.Buffer,
              appChildren: (document.getElementById('app') || {}).children ? document.getElementById('app').children.length : -1,
              htmlLen: document.body.innerHTML.length,
            })`
          )
          log('PAGE', JSON.stringify(info))
        } catch (error) {
          log('PAGE failed:', String(error))
        }
      }, 6000)
    }
    if (!vendorReady() && process.env.WOMIER_AUTO_INSTALL === '1') {
      startInstall().then((result) => {
        if (result.ok) setTimeout(() => win && loadUi(), 300)
      })
    }
  })

  win.webContents.on('console-message', (event, level, message) => {
    log('[renderer]', message)
  })

  win.webContents.on('render-process-gone', (event, details) => {
    log('renderer gone:', JSON.stringify(details))
  })

  if (process.env.WOMIER_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  win.on('closed', () => {
    win = null
  })
}

// --- IPC ------------------------------------------------------------------

ipcMain.handle('get-system-locale', () => app.getLocale())

ipcMain.handle('window-unmaximize', () => {
  if (win) win.unmaximize()
})

ipcMain.on('getScaleFactor', (event) => {
  event.returnValue = screen.getPrimaryDisplay().scaleFactor
})

ipcMain.on('international', (event, labels) => {
  log('menu labels:', JSON.stringify(labels))
})

ipcMain.on('setToolTip', (event, text) => {
  if (win && text) win.setTitle(String(text))
})

ipcMain.on('getOpenAtLogin', (event) => {
  event.sender.send('getOpenAtLogin', app.getLoginItemSettings().openAtLogin)
})

ipcMain.on('setOpenAtLogin', (event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: !!enabled, openAsHidden: true })
})

ipcMain.on('exit', () => app.quit())

// setup window API
ipcMain.handle('setup:state', () => ({ vendorReady: vendorReady(), userData: app.getPath('userData') }))

ipcMain.handle('setup:install', async () => {
  const result = await startInstall()
  if (result.ok) {
    setTimeout(() => {
      if (win) {
        loadUi()
      }
    }, 500)
  }
  return result
})

ipcMain.handle('setup:pick', async () => {
  const picked = await dialog.showOpenDialog(win, {
    title: 'Select the WOMIER driver installer',
    properties: ['openFile'],
    filters: [
      { name: 'WOMIER installer', extensions: ['exe', '7z'] },
      { name: 'All files', extensions: ['*'] },
    ],
  })
  if (picked.canceled || picked.filePaths.length === 0) return { ok: false, cancelled: true }
  const result = await startInstall(picked.filePaths[0])
  if (result.ok) {
    setTimeout(() => {
      if (win) loadUi()
    }, 500)
  }
  return result
})

ipcMain.handle('setup:quit', () => {
  app.quit()
})

ipcMain.handle('setup:permissions', async () => {
  const rule =
    'SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3151", ATTRS{idProduct}=="5030", MODE="0660", TAG+="uaccess"'
  const command = [
    `printf '%s\\n' '${rule}' > /etc/udev/rules.d/60-womier.rules`,
    'udevadm control --reload-rules',
    'udevadm trigger --subsystem-match=hidraw',
  ].join(' && ')
  const code = await new Promise((resolve) => {
    const child = spawn('pkexec', ['sh', '-c', command], { stdio: 'ignore' })
    child.on('error', () => resolve(-1))
    child.on('close', (status) => resolve(status))
  })
  log('permission helper exit:', code)
  return { ok: code === 0 }
})

// --- lifecycle ------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    setupHidPermissions()
    const service = createService({
      userDataDir: app.getPath('userData'),
      log: (...args) => log(...args),
    })
    service.start().catch((error) => log('iot service failed to start:', String(error)))
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
