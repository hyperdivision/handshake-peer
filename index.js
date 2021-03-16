const assert = require('nanoassert')
const secretstream = require('secretstream-stream')
const bint = require('bint8array')
const { Duplex } = require('streamx')
const pump = require('pump')

const { Encode, Decode } = require('./encoder')

module.exports = class HandshakePeer extends Duplex {
  constructor (localInfo, remoteInfo, transport, opts = {}) {
    super()

    this.localInfo = localInfo
    this.remoteInfo = remoteInfo

    this.recv = new Decode()
    this.send = new Encode()
    this.transport = transport

    this.keys = new Keys()
    this.encrypter = null
    this.decrypter = null

    this.handshake = opts.handshake
    this.handshakeState = null

    this._destroyed = false
  }

  _open (cb) {
    const self = this
    const handshake = this.handshake

    console.log('opening')
    let step = 0
    const initData = handshake[step++](self)

    if (initData) this.send.write(initData)

    this.recv.once('data', doHandshake(handshake[step++]))
    
    pump(this.send, this.transport, this.recv, err => {
      if (this._destroyed) return
      cb(err)
    })

    function doHandshake (fn) {
      return (data) => {
        self.recv.pause()

        let ret
        try {
          ret = fn(data, self)
          console.log(ret, step, 're')
          if (ret) self.send.write(ret)
        } catch (e) {
          self.send.error(e)
          return cb(e)
        }

        // proceed to next step, if there is one
        if (!self.keys.empty() && self.encrypter == null) {
          const header = new Uint8Array(secretstream.HEADERBYTES)
          self.encrypter = secretstream.encrypt(header, self.keys.local)
          self.send.write(header)
        }

        // proceed to next step, if there is one
        if (step !== handshake.length) {
          self.recv.once('data', doHandshake(handshake[step++]))
          return
        }

        // wipe handshake state
        self.handshakeState._sanitize()
        self.handshakeState = null

        self.recv.once('data', onheader)
      }
    }

    function onheader (header) {
      self.recv.pause()

      self.decrypter = secretstream.decrypt(header, self.keys.remote)

      self.recv.on('data', ondata)
      self.recv.resume()
      self.emit('handshake')

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

      if (!bint.compare(self.decrypter.decrypt.tag, secretstream.TAG_FINAL)) {
        self.push(null)
      }
    }
  }

  _write (data, cb) {
    const ciphertext = this.encrypter.encrypt(secretstream.TAG_MESSAGE, data)
    this.send.write(ciphertext)

    cb()
  }

  _final (cb) {
    const finalMessage = this.encrypter.encrypt(secretstream.TAG_FINAL, new Uint8Array(0))
    this.send.end(finalMessage)

    cb()
  }

  _predestroy () {
    this._destroyed = true
  }
}

class Keys {
  constructor () {
    this._remote = null
    this._local = null
  }

  get local () { return this._local }
  get remote () { return this._remote }

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
