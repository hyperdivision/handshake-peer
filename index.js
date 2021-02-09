const Spake = require('spake2-ee')
const Secretstream = require('secretstream-stream/stream')
const { Encode, Decode } = require('./encoder')

class SpakePeerServer {
  constructor (id, storage, req, res, opts = {}) {
    this.clients = storage
    this.id = id
    this.read = new Decode()
    this.send = new Encode()

    req.pipe(this.read)
    this.send.pipe(res)
  }

  get (username, cb) {
    const self = this

    const clientData = this.clients.get(username)
    const state = new Spake.ServerSide(this.id, clientData)

    const publicData = state.init()

    this.send.write(publicData)
    this.read.on('readable', onresponse)

    function onresponse (info) {
      info = self.read.read()
      console.log(info)
      self.read.removeListener('readable', onresponse)

      const response = state.respond(username, info.data)

      self.send.write(self.frameMsg(response))
      self.read.on('readable', onfinal)
    }

    function onfinal (info) {
      info = self.read.read()
      console.log(info)
      self.read.removeListener('data', onfinal)

      const sharedKeys = state.finalise(info.data)

      const send = new Secretstream.Push(Buffer.from(sharedKeys.serverSk))
      const recv = new Secretstream.Pull(Buffer.from(sharedKeys.clientSk))

      send.pipe(self.send)
      self.read.on('data', onheader)

      // cb(null, { send, recv })

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

class SpakePeerClient {
  constructor (username, req, res, opts = {}) {
    this.username = username
    this.read = new Decode()
    this.send = new Encode()

    req.pipe(this.read)
    this.send.pipe(res)
  }

  connect (pwd, cb) {
    const self = this

    const state = new Spake.ClientSide(this.username)

    self.read.on('readable', onpublicdata)

    function onpublicdata (info) {
      info = self.read.read()
      self.read.removeListener('readable', onpublicdata)

      const response = state.generate(info.data, pwd)

      self.send.write(self.frameMsg(response))
      self.read.on('readable', onresponse)
    }

    function onresponse (info) {
      info = self.read.read()
      self.read.removeListener('readable', onresponse)

      const sharedKeys = new Spake.SpakeSharedKeys

      const response = state.finalise(sharedKeys, info.serverId, info.data)
      self.send.push(self.frameMsg(response))

      const send = new Secretstream.Push(Buffer.from(sharedKeys.clientSk))
      const recv = new Secretstream.Pull(Buffer.from(sharedKeys.serverSk))

      send.on('data', d => self.send.push(d))
      self.read.on('data', onheader)

      function onheader (header) {
        console.log(header)
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
