const assert = require('nanoassert')
const secretstream = require('secretstream-stream')
const { Duplex } = require('streamx')
const pump = require('pump')

const { Encode, Decode } = require('./encoder')

module.exports = class HandshakePeer extends Duplex {
  constructor (localInfo, remoteInfo, transport, opts = {}) {
    super()

    this.localInfo = localInfo
    this.remoteInfo = remoteInfo

    this.read = new Decode()
    this.send = new Encode()

    this.keys = new Keys()
    this.encrypter = null
    this.decrypter = null

    this.handshake = opts.handshake
    this.handshakeState = null

    pump(transport.req, this.read)
    pump(this.send, transport.res)
  }

  _open (cb) {
    const self = this
    const handshake = this.handshake

    let step = 0
    const initData = handshake[step++](self)

    if (initData) this.send.write(initData)

    this.read.once('data', doHandshake(handshake[step++]))

    function doHandshake (fn) {
      return (data) => {
        self.read.pause()

        let ret
        try {
          ret = fn(data, self)
          if (ret) self.send.write(ret)
        } catch (e) {
          self.send.end(e)
          return cb(e)
        }

        // proceed to next step, if there is one
        if (!self.keys.empty() && self.encrypter == null) {
          const header = Buffer.alloc(secretstream.HEADERBYTES)
          self.encrypter = secretstream.encrypt(header, self.keys.local)
          self.send.write(header)
        }

        // proceed to next step, if there is one
        if (step !== handshake.length) {
          self.read.once('data', doHandshake(handshake[step++]))
          return
        }

        // wipe handshake state
        self.handshakeState._sanitize()
        self.handshakeState = null

        self.read.once('data', onheader)
      }
    }

    function onheader (header) {
      self.read.pause()

      self.decrypter = secretstream.decrypt(header, Buffer.from(self.keys.remote))

      self.read.on('data', ondata)
      self.read.resume()

      cb()
    }

    function ondata (data) {
      try {
        const plaintext = self.decrypter.decrypt(data)
        self.push(plaintext)
      } catch (e) {
        self.send.end(e)
        return cb(e)
      }

      if (self.decrypter.decrypt.tag.equals(secretstream.TAG_FINAL)) {
        self.push(null)
      }
    }
  }

  _write (data, cb) {
    const ciphertext = this.encrypter.encrypt(secretstream.TAG_MESSAGE, Buffer.from(data))
    this.send.write(ciphertext)

    cb()
  }

  _final (cb) {
    const finalMessage = this.encrypter.encrypt(secretstream.TAG_FINAL, Buffer.alloc(0))
    this.send.end(finalMessage)

    cb()
  }

  _predestroy () {
    this.send.end(null)
  }
}

class Keys {
  constructor () {
    this._remote = null
    this._local = null
  }

  get local () { return Buffer.from(this._local) }
  get remote () { return Buffer.from(this._remote) }

  set local (buf) {
    assert(buf instanceof Uint8Array, 'key should be a Buffer or Uint8Array')
    assert(buf.byteLength === secretstream.KEYBYTES, 'key should be secretstream.KEYBYTES [' + secretstream.KEYBYTES + '] bytes.')

    this._local = buf
  }

  set remote (buf) {
    assert(buf instanceof Uint8Array, 'key should be a Buffer or Uint8Array')
    assert(buf.byteLength === secretstream.KEYBYTES, 'key should be secretstream.KEYBYTES [' + secretstream.KEYBYTES + '] bytes.')

    this._remote = buf
  }

  empty () {
    return this._local == null || this._remote == null
  }
}
