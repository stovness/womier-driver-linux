#!/usr/bin/env node
// Exercises the Linux iot_manager stub the same way the vendor UI does:
// gRPC-web (text) POSTs to 127.0.0.1:6015 with hand-rolled protobuf.
//
// Usage: node scripts/test-iot-service.js

const http = require('http')

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

function frame(payload) {
  const header = Buffer.alloc(5)
  header.writeUInt32BE(payload.length, 1)
  return Buffer.concat([header, payload])
}

function call(method, payload) {
  const body = frame(payload).toString('base64')
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: 6015,
        path: `/iot_manager.IotManager/${method}`,
        method: 'POST',
        headers: {
          'content-type': 'application/grpc-web-text',
          'x-grpc-web': '1',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const raw = Buffer.from(Buffer.concat(chunks).toString('utf8'), 'base64')
          const frames = []
          let pos = 0
          while (pos + 5 <= raw.length) {
            const flag = raw[pos]
            const length = raw.readUInt32BE(pos + 1)
            const data = raw.subarray(pos + 5, pos + 5 + length)
            frames.push({ flag, data })
            pos += 5 + length
          }
          const message = frames.find((f) => f.flag === 0)
          const trailer = frames.find((f) => f.flag === 0x80)
          resolve({
            status: res.statusCode,
            payload: message ? message.data : Buffer.alloc(0),
            trailer: trailer ? trailer.data.toString('utf8') : '',
          })
        })
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

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

function decode(buffer) {
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
    } else {
      throw new Error(`unsupported wire type ${wire}`)
    }
  }
  return fields
}

const str = (fields, field) => {
  const hit = fields.find((f) => f.field === field && f.wire === 2)
  return hit ? hit.value.toString('utf8') : ''
}

async function main() {
  let failures = 0
  const check = (name, condition, detail) => {
    const status = condition ? 'ok' : 'FAIL'
    if (!condition) failures += 1
    console.log(`${status.padEnd(4)} ${name}${detail ? `: ${detail}` : ''}`)
  }

  const version = await call('GetVersion', Buffer.alloc(0))
  const versionFields = decode(version.payload)
  check('GetVersion base_version', str(versionFields, 1) === '0.1.6', str(versionFields, 1))
  check('GetVersion usage_environment', str(versionFields, 4) === 'Electron', str(versionFields, 4))

  const dbPath = 'web_driver/iot_db/test'
  const key = Buffer.from(JSON.stringify('smoke-test'))
  const value = Buffer.from(JSON.stringify({ hello: 'linux' }))

  const insert = await call('InsertDb', Buffer.concat([fString(1, dbPath), fBytes(2, key), fBytes(3, value)]))
  check('InsertDb success', decode(insert.payload).some((f) => f.field === 1 && f.value === 1n))

  const get = await call('GetItemFromDb', Buffer.concat([fString(1, dbPath), fBytes(2, key)]))
  const got = decode(get.payload)
  const gotValue = got.find((f) => f.field === 2)
  check('GetItemFromDb returns stored bytes', gotValue && gotValue.value.equals(value), gotValue ? gotValue.value.toString() : 'missing')

  const keys = await call('GetAllKeysFromDb', fString(1, dbPath))
  const keyItems = decode(keys.payload).filter((f) => f.field === 1).map((f) => f.value.toString())
  check('GetAllKeysFromDb lists the key', keyItems.includes(key.toString()), JSON.stringify(keyItems))

  const values = await call('GetAllValuesFromDb', fString(1, dbPath))
  const valueItems = decode(values.payload).filter((f) => f.field === 1).map((f) => f.value.toString())
  check('GetAllValuesFromDb lists the value', valueItems.includes(value.toString()))

  const removed = await call('DeleteItemFromDb', Buffer.concat([fString(1, dbPath), fBytes(2, key)]))
  check('DeleteItemFromDb success', decode(removed.payload).some((f) => f.field === 1 && f.value === 1n))

  const afterDelete = await call('GetItemFromDb', Buffer.concat([fString(1, dbPath), fBytes(2, key)]))
  const afterFields = decode(afterDelete.payload)
  check('GetItemFromDb empty after delete', !(afterFields.some((f) => f.field === 1 && f.value === 1n)))

  const light = await call('ControlDeviceLight', Buffer.concat([fString(1, '/dev/hidraw-test'), fVarint(2, 0), fString(4, 'linux')]))
  check('ControlDeviceLight success', decode(light.payload).some((f) => f.field === 1 && f.value === 1n))

  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('test failed:', error.message)
  process.exit(1)
})
