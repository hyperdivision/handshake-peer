const SpakePeer = require('./')
const spake = require('spake2-ee')
const { Transform, Readable } = require('streamx')

const storage = new Map()
const serverId = Buffer.from('server1')

const username = Buffer.from('anon')
const password = Buffer.from('password')

const registrationInfo = spake.ClientSide.register(password)

const serverReq = new Transform()
const serverRes = new Transform()

const server = new SpakePeer.Server(serverId, storage, serverReq, serverRes)
server.register(username, registrationInfo)

const client = new SpakePeer.Client(username, serverRes, serverReq)

client.connect(password, serverId, (err, transport) => {
  console.log('client connected!')
  transport.recv.on('data',  d => console.log('client received:', d.toString()))

  transport.send.push('hello server.')
  transport.send.push('hello server.')
})

server.get(username, (err, transport) => {
  console.log('server connected!')
  transport.recv.on('data', d => console.log('server received:', d))

  setTimeout(() => transport.send.push(Buffer.from('hello.')), 1000)
})
