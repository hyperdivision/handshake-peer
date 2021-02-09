const SpakePeer = require('./')
const spake = require('spake2-ee')
const { Duplex, Readable } = require('streamx')

const storage = new Map()
const serverId = Buffer.from('server1')

const username = Buffer.from('anon')
const password = Buffer.from('password')

const registrationInfo = spake.ClientSide.register(password)

const server = new SpakePeer.Server(serverId, storage)
server.register(username, registrationInfo)

const req = new Duplex()
const res = new Duplex()
const client = new SpakePeer.Client(username)

client.connect(password, req, res, (err, transport) => {
  console.log('client connected!')
  transport.recv.on('data',  d => console.log('client received:', d.toString()))

  transport.send.push('hello server.')
})

server.get(username, req, res, (err, transport) => {
  console.log('server connected!')
  transport.recv.on('data', d => console.log('server received:', d))

  setTimeout(() => transport.send.push(Buffer.from('hello.')), 1000)
})
