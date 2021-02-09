const Spake = require('spake2-ee')
const Secretstream = require('secretstream-stream/stream')

class SpakePeerServer {
  constructor (id, storage, opts = {}) {
    this.clients = storage
    this.serverId = id
  }

  get (username, req, res, cb) {
    const self = this

    const clientData = this.clients.get(username)
    const state = new Spake.ServerSide(this.serverId, clientData)

    const publicData = state.init()

    const msg = {
      method: 'SPAKE2EE',
      serverId: state.id,
      data: publicData
    }
    
    res.push(msg)
    req.on('data', onresponse)

    function onresponse (info) {
      if (info.method !== 'SPAKE2EE_CLIENT') return
      req.removeListener('data', onresponse)

      const response = state.respond(username, info.data)
      const msg = {
        method: 'SPAKE2EE',
        serverId: state.id,
        data: response
      }

      req.on('data', onfinal)
    }

    function onfinal (info) {
      if (info.method !== 'SPAKE2EE_CLIENT') return
      req.removeListener('data', onfinal)

      const sharedKeys = state.finalise(info.data)

      const send = new Secretstream.Push(Buffer.from(sharedKeys.serverSk))
      const recv = new Secretstream.Pull(Buffer.from(sharedKeys.clientSk))

      const transport = {}
      transport.send = send.pipe(res)
      transport.recv = req.pipe(recv)

      cb(null, transport)
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
  constructor (username, opts = {}) {
    this.username = username
  }

  connect (pwd, req, res, cb) {
    const self = this

    const state = new Spake.ClientSide(this.username)

    res.on('data', onpublicdata)

    function onpublicdata (info) {
      if (info.method !== 'SPAKE2EE') return
      res.removeListener('data', onpublicdata)

      const response = state.generate(info.data, pwd)

      const msg = {
        method: 'SPAKE2EE_CLIENT',
        data: response
      }

      req.push(msg)
      res.on('data', onresponse)
    }

    function onresponse (info) {
      if (info.method !== 'SPAKE2EE') return
      res.removeListener('data', onresponse)

      const sharedKeys = new Spake.SpakeSharedKeys

      const response = state.finalise(sharedKeys, info.serverId, info.data)

      const msg = {
        method: 'SPAKE2EE_CLIENT',
        data: response
      }

      res.on('data', onheader)

      function onheader (header) {
        const send = new Secretstream.Push(Buffer.from(sharedKeys.clientSk))
        const recv = new Secretstream.Pull(Buffer.from(sharedKeys.serverSk))

        const transport = {}
        transport.send = send.pipe(req)
        transport.recv = res.pipe(recv)

        cb(null, transport)
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
