#!/usr/bin/env node
// Patches the vendor renderer bundle so it runs on Linux.
//
// Two edits, both in the minified main bundle (dist/js/index.*.js):
//
// 1. getIOTSwitch() forces the Windows IOT sidecar on whenever the app runs
//    inside Electron. On Linux we want the WebHID path the app already uses
//    in a browser, so the Electron branch returns false.
//
// 2. checkSessionId() gates every iot_manager RPC behind a session id that
//    only the vendor's Windows service hands out. Our Linux service has no
//    handshake, so the gate is opened.
//
// Run against your own copy of the app (the vendor code is not redistributed):
//   node scripts/patch-app.js /path/to/womier-app
//
// The original file is kept next to the patched one as *.orig.

const fs = require('fs')
const path = require('path')

const EDITS = [
  {
    name: 'use WebHID instead of the Windows IOT sidecar',
    from: 'return ia?t=!0:',
    to: 'return ia?t=!1:',
  },
  {
    name: 'open the iot_manager session gate',
    from: 'checkSessionId=t=>this.sessionId!==void 0',
    to: 'checkSessionId=t=>!0',
  },
]

function findBundle(appDir) {
  const jsDir = path.join(appDir, 'dist', 'js')
  if (!fs.existsSync(jsDir)) {
    throw new Error(`no dist/js directory under ${appDir}`)
  }
  const candidates = fs
    .readdirSync(jsDir)
    .filter((name) => name.startsWith('index.') && name.endsWith('.js'))
    .map((name) => path.join(jsDir, name))

  for (const file of candidates) {
    const text = fs.readFileSync(file, 'utf8')
    if (text.includes(EDITS[0].from) || text.includes(EDITS[0].to)) return file
  }
  throw new Error('could not find the main renderer bundle (no IOT switch marker)')
}

function main() {
  const appDir = path.resolve(process.argv[2] || '.')
  const bundle = findBundle(appDir)
  const original = fs.readFileSync(bundle, 'utf8')
  const backup = `${bundle}.orig`

  if (!fs.existsSync(backup)) fs.writeFileSync(backup, original)

  let text = original
  let changed = 0
  for (const edit of EDITS) {
    if (text.includes(edit.to)) {
      console.log(`already patched: ${edit.name}`)
      continue
    }
    if (!text.includes(edit.from)) {
      console.log(`SKIP (marker not found): ${edit.name}`)
      continue
    }
    text = text.split(edit.from).join(edit.to)
    changed += 1
    console.log(`patched: ${edit.name}`)
  }

  if (changed > 0) {
    fs.writeFileSync(bundle, text)
    console.log(`wrote ${bundle} (backup at ${path.basename(backup)})`)
  } else {
    console.log('nothing to do')
  }

  const stillWrong = EDITS.some((edit) => text.includes(edit.from))
  process.exit(stillWrong ? 1 : 0)
}

main()
