const Spake = require('spake2-ee')
const HandshakePeer = require('./')

const handshake = {}
handshake.Server = [
  function (self) {
    self.handshakeState = new Spake.ServerSide(self.localInfo.id, self.remoteInfo.data)
    const publicData = self.handshakeState.init()

    return publicData
  },
  function (data, self) {
    const response = self.handshakeState.respond(self.remoteInfo.username, data)
    return response
  },
  function (data, self) {
    const { serverSk, clientSk } = self.handshakeState.finalise(data)
    self.keys.local = serverSk
    self.keys.remote = clientSk
  }
]

handshake.Client = [
  function (self) {
    self.handshakeState = new Spake.ClientSide(self.localInfo.username)
  },
  function (data, self) {
    const response = self.handshakeState.generate(data, self.localInfo.password)
    return response
  },
  function (data, self) {
    const keys = new Spake.SpakeSharedKeys()
    const response = self.handshakeState.finalise(keys, self.remoteInfo.serverId, data)

    self.keys.local = keys.clientSk
    self.keys.remote = keys.serverSk

    return response
  }
]

class SpakePeerClient extends HandshakePeer {
  constructor (...args) {
    super(...args)
    this.handshake = handshake.Client
  }
}

class SpakePeerServer extends HandshakePeer {
  constructor (...args) {
    super(...args)
    this.handshake = handshake.Server
  }
}

module.exports = {
  handshake,
  SpakePeerServer,
  SpakePeerClient
}
