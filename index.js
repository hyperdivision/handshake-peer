const Spake = require('spake2-ee')
const Secretstream = require('secretstream-stream/stream')
const { Duplex } = require('streamx')
const { Encode, Decode } = require('./encoder')

class SpakePeerServer extends Duplex {
  constructor (id, username, clientData, req, res, opts = {}) {
    this.id = id
    this.read = new Decode()
    this.send = new Encode()
    this.clientId = username
    this.clientData = clientData

    req.pipe(this.read)
    this.send.pipe(res)
  }

  get (cb) {
    const self = this

    const state = new Spake.ServerSide(this.id, this.clientData)
    const publicData = state.init()

    this.send.write(publicData)
    this.read.on('readable', onresponse)

    function onresponse (info) {
      info = self.read.read()
      self.read.removeListener('readable', onresponse)

      const response = state.respond(self.clientId, info)

      self.send.write(response)
      self.read.on('readable', onfinal)
    }

    function onfinal (info) {
      info = self.read.read()
      self.read.removeListener('data', onfinal)

      const sharedKeys = state.finalise(info)

      const send = new Secretstream.Push(Buffer.from(sharedKeys.serverSk))
      const recv = new Secretstream.Pull(Buffer.from(sharedKeys.clientSk))

      send.pipe(self.send)
      self.read.on('data', onheader)

      function onheader (header) {
        console.log('server', header)
        self.read.removeListener('data', onheader)
        self.read.on('data', d => recv.push(d))

        cb(null, { send, recv })    
      }
    }

    function onerror (err) {
      return cb(err)
    }
  }

  register (username, info) {
    this._register(username, info)
  }

  _register (username, info) {
    this.clients.set(username, info)
  }
}

class SpakePeerClient extends Duplex {
  constructor (username, pwd, serverId, req, res, opts = {}) {
    this.username = username
    this.read = new Decode()
    this.send = new Encode()

    this.pwd = pwd
    this.serverId = serverId

    req.pipe(this.read)
    this.send.pipe(res)
  }

  connect (cb) {
    const self = this

    const state = new Spake.ClientSide(this.username)

    self.read.on('readable', onpublicdata)

    function onpublicdata (info) {
      info = self.read.read()
      console.log(info)
      self.read.removeListener('readable', onpublicdata)

      const response = state.generate(info, self.pwd)

      self.send.write(response)
      self.read.on('readable', onresponse)
    }

    function onresponse (info) {
      info = self.read.read()
      self.read.removeListener('readable', onresponse)

      const sharedKeys = new Spake.SpakeSharedKeys

      const response = state.finalise(sharedKeys, self.serverId, info)
      self.send.push(response)

      const send = new Secretstream.Push(Buffer.from(sharedKeys.clientSk))
      const recv = new Secretstream.Pull(Buffer.from(sharedKeys.serverSk))

      console.log('header')

      send.on('data', d => self.send.push(d))
      self.read.on('data', onheader)

      function onheader (header) {
        console.log('header')
        self.read.removeListener('data', onheader)
        self.read.on('data', d => recv.push(d))

        cb(null, { send, recv })    
      }
    }

    function onerror (err) {
      return cb(err)
    }
  }
}

module.exports = {
  Server: SpakePeerServer,
  Client: SpakePeerClient
}
