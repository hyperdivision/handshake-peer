const { SpakePeerServer, SpakePeerClient } = require('./spake')
const Spake = require('spake2-ee')
const { Transform } = require('streamx')

const serverId = Buffer.from('server1')

const username = Buffer.from('anon')
const password = Buffer.from('password')

const clientInfo = {
  username,
  data: Spake.ClientSide.register(password)
}

const serverReq = new Transform()
const clientReq = new Transform()

const clientTransport = {
  req: clientReq,
  res: serverReq
}

const serverTransport = {
  res: clientReq,
  req: serverReq
}

const server = new SpakePeerServer({ id: serverId }, clientInfo, serverTransport)
const client = new SpakePeerClient({ username, password }, { serverId }, clientTransport)

server.on('data', d => console.log('server received:', d.toString()))
client.on('data', d => console.log('client received:', d.toString()))

server.on('end', () => console.log('stream closed'))

server.write('hello, client.')
client.write('hello, server.')
client.end()
