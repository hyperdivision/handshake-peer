const { Transform } = require('streamx')
const bint = require('bint8array')

class Encode extends Transform {
  constructor () {
    super()
  }

  error (msg) {
    if (typeof msg === 'string') return this.error(bint.fromString(msg))
    this.push(this.format(msg, true))
  }

  _transform (data, cb) {
    cb(null, this.format(data))
  }

  _destroy (cb) {
    cb()
  }

  format (data, error = false) {
    const frame = new Uint8Array(3)
    const view = new DataView(frame.buffer, frame.byteOffset)

    // error flag
    if (error) view.setUint8(0, 0xff)

    view.setUint16(1, data.length, true)
    return bint.concat([frame, data])
  }
}

class Decode extends Transform {
  constructor () {
    super()

    this._readingFrame = true
    this._missing = 3 // 2 bytes
    this._buffered = null
  }

  _transform (data, cb) {
    let err = 0

    while (data.byteLength > 0) {
      if (this._buffered) {
        data = bint.concat([this._buffered, data])
        this._buffered = null
      }

      if (data.byteLength < this._missing) {
        this._buffered = data
        return cb()
      }

      if (this._readingFrame) {
        this._readingFrame = false
        const view = new DataView(data.buffer, data.byteOffset)

        err |= view.getUint8(0)

        this._missing = view.getUint16(1, true)
        data = data.slice(3)
        continue
      }

      const message = data.slice(0, this._missing)
      data = data.slice(this._missing)

      this._missing = 3
      this._readingFrame = true

      // handle error
      if (err !== 0) return cb(bint.toString(message))

      this.push(message)
    }

    cb(null)

    function readFrame (view) {
      const error = view.getUint8(0)

      if (error === 0xff) {

      }
    }
  }
}

module.exports = {
  Encode,
  Decode
}
