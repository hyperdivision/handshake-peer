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
    this.read.on('readable', onresponse)

    function onresponse () {
      const info = self.read.read()
      self.read.removeListener('readable', onresponse)

      const response = state.respond(self.clientId, info)

      self.send.write(response)
      self.read.on('readable', onfinal)
    }

    function onfinal () {
      const info = self.read.read()
      self.read.removeListener('data', onfinal)

      self.keys = state.finalise(info)

      const header = Buffer.alloc(secretstream.HEADERBYTES)
      self.encrypter = secretstream.encrypt(header, Buffer.from(self.keys.serverSk))

      self.read.on('readable', onheader)
    }

    function onheader () {
      const info = self.read.read()
      self.read.removeListener('data', onheader)

      self.decrypter = secretstream.encrypt(info, Buffer.from(self.keys.clientSk))
      self.read.on('data', d => self.push(d))
    }

    function onerror (err) {
      return cb(err)
    }
  }

  _write (data, cb) {
    const ciphertext = this.encrypter.encrypt(data)
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

    self.read.on('readable', onpublicdata)

    function onpublicdata () {
      const info = self.read.read()
      console.log(info)
      self.read.removeListener('readable', onpublicdata)

      const response = state.generate(info, self.pwd)

      self.send.write(response)
      self.read.on('readable', onresponse)
    }

    function onresponse () {
      const info = self.read.read()
      self.read.removeListener('readable', onresponse)

      const response = state.finalise(self.keys, self.serverId, info)

      const header = Buffer.alloc(secretstream.HEADERBYTES)
      console.log(self.keys)
      self.encrypter = secretstream.encrypt(header, Buffer.from(self.keys.clientSk))

      self.send.push(response)
      self.read.on('readable', onheader)
    }

    function onheader () {
      const info = self.read.read()
      self.read.removeListener('data', onheader)

      self.decrypter = secretstream.encrypt(info, Buffer.from(self.keys.serverSk))
      self.read.on('data', d => self.push(d))
    }

    function onerror (err) {
      return cb(err)
    }
  }

  _write (data, cb) {
    const ciphertext = this.encrypter.encrypt(data)
    this.send.write(ciphertext)

    cb()
  }
}

module.exports = {
  Server: SpakePeerServer,
  Client: SpakePeerClient
}
