const Spake = require('spake2-ee')
const Secretstream = require('secretstream-stream/stream')

class SpakePeerServer {
  constructor (id, storage, opts = {}) {
    this.clients = storage
    this.id = id
  }

  get (username, req, res, cb) {
    const self = this

    const clientData = this.clients.get(username)
    const state = new Spake.ServerSide(this.id, clientData)

    const publicData = state.init()

    res.push(self.frameMsg(publicData))
    req.on('readable', onresponse)

    function onresponse (info) {
      info = req.read()
      if (info.method !== 'SPAKE2EE') return
      req.removeListener('readable', onresponse)

      const response = state.respond(username, info.data)

      res.push(self.frameMsg(response))
      req.on('readable', onfinal)
    }

    function onfinal (info) {
      info = req.read()
      if (info.method !== 'SPAKE2EE') return
      req.removeListener('data', onfinal)

      const sharedKeys = state.finalise(info.data)

      const send = new Secretstream.Push(Buffer.from(sharedKeys.serverSk))
      const recv = new Secretstream.Pull(Buffer.from(sharedKeys.clientSk))

      send.on('data', d => res.push(d))
      req.on('data', onheader)

      function onheader () {
        req.removeListener('data', onheader)
        req.on('data', d => recv.push(d))

        cb(null, { send, recv })    
      }
    }

    function onerror (err) {
      return cb(err)
    }
  }

  frameMsg (data) {
    return {
      method: 'SPAKE2EE',
      serverId: this.id,
      data
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
  constructor (username, opts = {}) {
    this.username = username
  }

  connect (pwd, req, res, cb) {
    const self = this

    const state = new Spake.ClientSide(this.username)

    res.on('readable', onpublicdata)

    function onpublicdata (info) {
      info = res.read()
      if (info.method !== 'SPAKE2EE') return
      res.removeListener('readable', onpublicdata)

      const response = state.generate(info.data, pwd)

      req.push(self.frameMsg(response))
      res.on('readable', onresponse)
    }

    function onresponse (info) {
      info = res.read()
      if (info.method !== 'SPAKE2EE') return
      res.removeListener('readable', onresponse)

      const sharedKeys = new Spake.SpakeSharedKeys

      const response = state.finalise(sharedKeys, info.serverId, info.data)
      req.push(self.frameMsg(response))

      const send = new Secretstream.Push(Buffer.from(sharedKeys.clientSk))
      const recv = new Secretstream.Pull(Buffer.from(sharedKeys.serverSk))

      send.on('data', d => req.push(d))
      res.on('data', onheader)


      function onheader () {
        res.removeListener('data', onheader)
        res.on('data', d => recv.push(d))

        cb(null, { send, recv })    
      }
    }

    function onerror (err) {
      return cb(err)
    }
  }

  frameMsg (data) {
    return {
      method: 'SPAKE2EE',
      username: this.username,
      data
    }
  }
}

module.exports = {
  Server: SpakePeerServer,
  Client: SpakePeerClient
}
