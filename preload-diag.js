// Runs before the renderer to log WebHID calls for debugging (WOMIER_DIAG=1).

window.__errs = []
window.addEventListener(
  'error',
  (event) => {
    try {
      const detail = event.error && (event.error.stack || event.error.message)
      window.__errs.push(String(detail || event.message || event.type))
    } catch {
      window.__errs.push('unknown error')
    }
  },
  true
)
window.addEventListener('unhandledrejection', (event) => {
  try {
    const reason = event.reason
    window.__errs.push('rejection: ' + String((reason && (reason.stack || reason.message)) || reason))
  } catch {
    window.__errs.push('unknown rejection')
  }
})

if (process.env.WOMIER_DIAG === '1') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const text = reason && (reason.stack || reason.message) ? reason.stack || reason.message : String(reason)
    console.error('UNHANDLED REJECTION:', text)
  })

  window.addEventListener('error', (event) => {
    console.error('WINDOW ERROR:', event.message, event.filename, event.lineno)
  })

  const hex = (value, limit) => {
    try {
      if (!value) return String(value)
      let bytes
      if (value instanceof Uint8Array) bytes = value
      else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value)
      else if (value.buffer instanceof ArrayBuffer) bytes = new Uint8Array(value.buffer)
      else return String(value)
      const parts = []
      for (let i = 0; i < Math.min(bytes.length, limit || 12); i++) {
        parts.push(bytes[i].toString(16).padStart(2, '0'))
      }
      return parts.join(' ') + (bytes.length > (limit || 12) ? ' ...' : '')
    } catch {
      return '<unprintable>'
    }
  }

  if (typeof HIDDevice !== 'undefined') {
    const wrap = (name, describeArgs, describeResult) => {
      const original = HIDDevice.prototype[name]
      if (typeof original !== 'function') return
      HIDDevice.prototype[name] = function (...args) {
        const where = `HID ${this.productName} ${this.vendorId}:${this.productId}`
        const argText = describeArgs ? describeArgs(args) : ''
        try {
          const result = original.apply(this, args)
          if (result && typeof result.then === 'function') {
            return result.then(
              (value) => {
                console.log(`${where} ${name}(${argText}) ok`, describeResult ? describeResult(value) : '')
                return value
              },
              (error) => {
                console.log(`${where} ${name}(${argText}) FAILED`, String(error))
                throw error
              }
            )
          }
          return result
        } catch (error) {
          console.log(`${where} ${name}(${argText}) THREW`, String(error))
          throw error
        }
      }
    }

    wrap('open')
    wrap('sendFeatureReport', (args) => `reportId=${args[0]} data=${hex(args[1], 16)}`)
    wrap('receiveFeatureReport', (args) => `reportId=${args[0]}`, (value) => `data=${hex(value, 24)}`)
    wrap('sendReport', (args) => `reportId=${args[0]} data=${hex(args[1], 16)}`)
  }
}
