const { Transform } = require('streamx')
const bint = require('bint8array')

class Encode extends Transform {
  constructor () {
    super()
  }

  _transform (data, cb) {
    const frame = new Uint8Array(2)
    const view = new DataView(frame.buffer, frame.byteOffset)
    view.setUint16(0, data.length, true)
    cb(null, bint.concat([frame, data]))
  }
}

class Decode extends Transform {
  constructor () {
    super()

    this._readingFrame = true
    this._missing = 2 // 2 bytes
    this._buffered = null
  }

  _transform (data, cb) {
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
        this._missing = view.getUint16(0, true)
        data = data.slice(2)
        continue
      }

      const message = data.slice(0, this._missing)
      data = data.slice(this._missing)

      this._missing = 2
      this._readingFrame = true

      this.push(message)
    }

    cb(null)
  }
}

module.exports = {
  Encode,
  Decode
}
