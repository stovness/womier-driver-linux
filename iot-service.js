// Minimal iot_manager gRPC-web service for the Linux port.
//
// The vendor UI expects a local Windows service (iot_manager_rs.exe) on
// 127.0.0.1:6015. On Linux we get all HID traffic through WebHID in the
// renderer, but the UI still uses this service for a handful of things:
// version reporting, a couple of device bookkeeping calls, and its local
// key/value database (saved configs, light images, macros).
//
// This module implements the parts the UI actually calls, speaking the same
// gRPC-web protocol (text format) with hand-rolled protobuf encoding.

const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PORT = 6015
const SERVICE = 'iot_manager.IotManager'
const IOT_MANAGER_VERSION = '0.1.6'

// --- protobuf encoding ----------------------------------------------------

function varint(value) {
  let n = BigInt(value)
  const bytes = []
  do {
    let byte = Number(n & 0x7fn)
    n >>= 7n
    if (n > 0n) byte |= 0x80
    bytes.push(byte)
  } while (n > 0n)
  return Buffer.from(bytes)
}

const tag = (field, wire) => varint((field << 3) | wire)
const fVarint = (field, value) => Buffer.concat([tag(field, 0), varint(value)])
const fString = (field, value) => {
  const body = Buffer.from(String(value), 'utf8')
  return Buffer.concat([tag(field, 2), varint(body.length), body])
}
const fBytes = (field, value) => {
  const body = Buffer.from(value)
  return Buffer.concat([tag(field, 2), varint(body.length), body])
}
const fBool = (field, value) => fVarint(field, value ? 1 : 0)

function message(...parts) {
  return Buffer.concat(parts.filter((p) => p && p.length))
}

// --- message encoders -----------------------------------------------------

const empty = () => Buffer.alloc(0)
const general = (success, text) => message(fBool(1, success), fString(2, text || (success ? 'OK' : 'FAILED')))

const versionResponse = () =>
  message(
    fString(1, IOT_MANAGER_VERSION),
    fString(2, 'linux-port'),
    fString(3, `${IOT_MANAGER_VERSION}-linux`),
    fString(4, 'Electron')
  )

const clientInfo = (clientId, sessionId) => message(fVarint(1, clientId), fString(2, sessionId))
const clientMonitoring = (clientId, sessionId) => fBytes(1, clientInfo(clientId, sessionId))
const getAutostart = () => fBool(1, false)
const getItem = (value) => message(fBool(1, !!value), value ? fBytes(2, value) : Buffer.alloc(0))
const getAll = (items) => message(...items.map((item) => fBytes(1, item)), fString(2, 'OK'))
const killProcess = () => message(fBool(1, true), fString(2, 'not supported on linux'))
const shutdownResponse = () => fString(1, 'OK')

// --- key/value database ---------------------------------------------------

class Database {
  constructor(root) {
    this.root = root
    fs.mkdirSync(root, { recursive: true })
  }

  fileFor(dbPath) {
    const safe = String(dbPath).replace(/[^A-Za-z0-9._-]+/g, '__')
    return path.join(this.root, `${safe}.json`)
  }

  load(dbPath) {
    try {
      const raw = fs.readFileSync(this.fileFor(dbPath), 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && parsed.items) return parsed
    } catch {
      // missing or corrupt: start empty
    }
    return { items: {} }
  }

  save(dbPath, data) {
    const file = this.fileFor(dbPath)
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data))
    fs.renameSync(tmp, file)
  }

  insert(dbPath, key, value) {
    const data = this.load(dbPath)
    data.items[Buffer.from(key).toString('base64')] = Buffer.from(value).toString('base64')
    this.save(dbPath, data)
    return true
  }

  remove(dbPath, key) {
    const data = this.load(dbPath)
    delete data.items[Buffer.from(key).toString('base64')]
    this.save(dbPath, data)
    return true
  }

  get(dbPath, key) {
    const data = this.load(dbPath)
    const encoded = data.items[Buffer.from(key).toString('base64')]
    return encoded ? Buffer.from(encoded, 'base64') : null
  }

  all(dbPath) {
    const data = this.load(dbPath)
    return Object.entries(data.items).map(([key, value]) => ({
      key: Buffer.from(key, 'base64'),
      value: Buffer.from(value, 'base64'),
    }))
  }
}

// --- protobuf decoding (just the fields we need) ---------------------------

function readVarint(buffer, offset) {
  let result = 0n
  let shift = 0n
  let pos = offset
  while (pos < buffer.length) {
    const byte = buffer[pos++]
    result |= BigInt(byte & 0x7f) << shift
    if ((byte & 0x80) === 0) break
    shift += 7n
  }
  return [result, pos]
}

function decodeFields(buffer) {
  const fields = []
  let pos = 0
  while (pos < buffer.length) {
    let key
    ;[key, pos] = readVarint(buffer, pos)
    const field = Number(key >> 3n)
    const wire = Number(key & 7n)
    if (wire === 0) {
      let value
      ;[value, pos] = readVarint(buffer, pos)
      fields.push({ field, wire, value })
    } else if (wire === 2) {
      let length
      ;[length, pos] = readVarint(buffer, pos)
      const end = pos + Number(length)
      fields.push({ field, wire, value: buffer.subarray(pos, end) })
      pos = end
    } else if (wire === 1) {
      fields.push({ field, wire, value: buffer.subarray(pos, pos + 8) })
      pos += 8
    } else if (wire === 5) {
      fields.push({ field, wire, value: buffer.subarray(pos, pos + 4) })
      pos += 4
    } else {
      break
    }
  }
  return fields
}

const firstString = (fields, field) => {
  const hit = fields.find((f) => f.field === field && f.wire === 2)
  return hit ? hit.value.toString('utf8') : ''
}
const firstBytes = (fields, field) => {
  const hit = fields.find((f) => f.field === field && f.wire === 2)
  return hit ? hit.value : Buffer.alloc(0)
}

// --- grpc-web framing ----------------------------------------------------

function frame(payload) {
  const header = Buffer.alloc(5)
  header[0] = 0
  header.writeUInt32BE(payload.length, 1)
  return Buffer.concat([header, payload])
}

function trailer(status) {
  const body = Buffer.from(`grpc-status: ${status}\r\n`)
  const header = Buffer.alloc(5)
  header[0] = 0x80
  header.writeUInt32BE(body.length, 1)
  return Buffer.concat([header, body])
}

function unframe(body) {
  if (body.length < 5) return Buffer.alloc(0)
  const length = body.readUInt32BE(1)
  return body.subarray(5, Math.min(5 + length, body.length))
}

// --- service --------------------------------------------------------------

function createService({ userDataDir, log = () => {} }) {
  const db = new Database(path.join(userDataDir, 'iot_db'))
  const sessionId = crypto.randomUUID()
  const clientId = BigInt(Date.now())

  const handlers = {
    GetVersion: () => versionResponse(),
    IsRunning: () => empty(),
    StartClientMonitoring: () => clientMonitoring(clientId, sessionId),
    SetAutostart: () => general(true),
    GetAutostart: () => getAutostart(),
    InsertDb: (fields) => {
      const dbPath = firstString(fields, 1)
      const key = firstBytes(fields, 2)
      const value = firstBytes(fields, 3)
      const ok = db.insert(dbPath, key, value)
      return general(ok)
    },
    DeleteItemFromDb: (fields) => general(db.remove(firstString(fields, 1), firstBytes(fields, 2))),
    GetItemFromDb: (fields) => getItem(db.get(firstString(fields, 1), firstBytes(fields, 2))),
    GetAllKeysFromDb: (fields) => getAll(db.all(firstString(fields, 1)).map((item) => item.key)),
    GetAllValuesFromDb: (fields) => getAll(db.all(firstString(fields, 1)).map((item) => item.value)),
    ControlService: () => general(false, 'Windows-only background services are not available on Linux'),
    ControlFeature: () => general(false, 'this feature needs the Windows background service'),
    ControlDeviceLoopCheckStatus: () => general(true),
    ControlAllDeviceLoopCheckStatus: () => general(true),
    ControlDeviceLight: () => general(true),
    KillProcessOnPort: () => killProcess(),
    AddDeviceFilter: () => general(true),
    Shutdown: () => shutdownResponse(),
  }

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(404).end()
      return
    }

    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const url = req.url || ''
      const method = url.split('/').pop()
      const contentType = String(req.headers['content-type'] || '')
      const textMode = contentType.includes('grpc-web-text')
      const raw = Buffer.concat(chunks)
      const body = textMode ? Buffer.from(raw.toString('utf8'), 'base64') : raw
      const payload = unframe(body)

      const handler = handlers[method]
      if (!handler) {
        log(`rpc ${method}: unhandled`)
        res.writeHead(200, { 'content-type': contentType || 'application/grpc-web-text' })
        res.end((textMode ? Buffer.concat([trailer(12)]) : Buffer.concat([trailer(12)])).toString('base64'))
        return
      }

      let response
      let status = 0
      try {
        response = handler(decodeFields(payload))
      } catch (error) {
        log(`rpc ${method}: FAILED ${error}`)
        response = Buffer.alloc(0)
        status = 13
      }

      if (method !== 'StartClientMonitoring') log(`rpc ${method}: ok`)

      const framed = Buffer.concat([frame(response), trailer(status)])
      res.writeHead(200, {
        'content-type': textMode ? 'application/grpc-web-text' : 'application/grpc-web+proto',
        'grpc-encoding': 'identity',
      })
      res.end(textMode ? framed.toString('base64') : framed)
    })
  })

  server.on('error', (error) => log(`service error: ${error.message}`))

  return {
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(PORT, '127.0.0.1', () => {
          log(`iot_manager service listening on 127.0.0.1:${PORT}`)
          resolve()
        })
      })
    },
    stop() {
      server.close()
    },
  }
}

module.exports = { createService, PORT }
