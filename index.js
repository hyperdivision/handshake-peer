const Spake = require('spake2-ee')
const secretstream = require('secretstream-stream')
const { Duplex } = require('streamx')
const { Encode, Decode } = require('./encoder')

class SpakePeerServer extends Duplex {
  constructor (id, username, clientData, req, res, opts = {}) {
    super()

    this.id = id
    this.read = new Decode()
    this.send = new Encode()
    this.clientId = username
    this.clientData = clientData
    
    this.keys = null
    this.encrypter = null
    this.decrypter = null

    req.pipe(this.read)
    this.send.pipe(res)
  }

  _open (cb) {
    const self = this

    const state = new Spake.ServerSide(this.id, this.clientData)
    const publicData = state.init()

    this.send.write(publicData)
    this.read.once('data', onresponse)

    function onresponse (info) {
      self.read.pause()

      const response = state.respond(self.clientId, info)

      self.send.write(response)
      self.read.once('data', onfinal)
    }

    function onfinal (info) {
      self.read.pause()

      self.keys = state.finalise(info)

      const header = Buffer.alloc(secretstream.HEADERBYTES)
      self.encrypter = secretstream.encrypt(header, Buffer.from(self.keys.serverSk))

      self.send.write(header)
      self.read.once('data', onheader)
    }

    function onheader (info) {
      self.read.pause()

      self.decrypter = secretstream.decrypt(info, Buffer.from(self.keys.clientSk))
      self.read.on('data', ondata)
      self.read.resume()

      cb()
    }

    function ondata (data) {
      const plaintext = self.decrypter.decrypt(data)
      self.push(plaintext)

      if (self.decrypter.decrypt.tag === secretstream.TAG_FINAL) {
        self.send.push(null)
        self.push(null)
      }
    }

    function onerror (err) {
      return cb(err)
    }
  }

  _write (data, cb) {
    const ciphertext = this.encrypter.encrypt(secretstream.TAG_MESSAGE, Buffer.from(data))
    this.send.write(ciphertext)

    cb()
  }
}

class SpakePeerClient extends Duplex {
  constructor (username, pwd, serverId, req, res, opts = {}) {
    super()

    this.username = username
    this.read = new Decode()
    this.send = new Encode()

    this.pwd = pwd
    this.serverId = serverId

    this.keys = new Spake.SpakeSharedKeys()
    this.encrypter = null
    this.decrypter = null

    req.pipe(this.read)
    this.send.pipe(res)
  }

  _open (cb) {
    const self = this

    const state = new Spake.ClientSide(this.username)

    self.read.once('data', onpublicdata)

    function onpublicdata (info) {
      self.read.pause()

      const response = state.generate(info, self.pwd)

      self.send.write(response)
      self.read.once('data', onresponse)
    }

    function onresponse (info) {
      self.read.pause()

      const response = state.finalise(self.keys, self.serverId, info)

      const header = Buffer.alloc(secretstream.HEADERBYTES)
      self.encrypter = secretstream.encrypt(header, Buffer.from(self.keys.clientSk))

      self.send.write(response)
      self.send.write(header)
      self.read.once('data', onheader)
    }

    function onheader (info) {
      self.read.pause()

      self.decrypter = secretstream.decrypt(info, Buffer.from(self.keys.serverSk))
      self.read.on('data', ondata)
      self.read.resume()

      cb()
    }

    function ondata (data) {
      const plaintext = self.decrypter.decrypt(data)
      self.push(plaintext)

      if (self.decrypter.decrypt.tag === secretstream.TAG_FINAL) {
        self.send.push(null)
        self.push(null)
      }
    }

    function onerror (err) {
      return cb(err)
    }
  }

  _write (data, cb) {
    const ciphertext = this.encrypter.encrypt(secretstream.TAG_MESSAGE, Buffer.from(data))
    this.send.write(ciphertext)

    cb()
  }
}

module.exports = {
  Server: SpakePeerServer,
  Client: SpakePeerClient
}
