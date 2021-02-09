const SpakePeer = require('./')
const spake = require('spake2-ee')
const { Duplex, Readable } = require('streamx')

const storage = new Map()
const serverId = 'server1'

const username = 'anon'
const password = Buffer.from('password')

const registrationInfo = spake.ClientSide.register(password)

const server = new SpakePeer.Server(serverId, storage)
server.register(username, registrationInfo)

const req = new Duplex()
const res = new Duplex()
const client = new SpakePeer.Client(username)

client.connect(password, req, res, (err, transport) => {
  console.log('client connected!', Readable.isBackpressured(res))
  transport.recv.pipe(process.stdout)
})

server.get(username, req, res, (err, transport) => {
  console.log('server connected!', Readable.isBackpressured(req))
  transport.recv.on('data', d => console.log('server received:', d))

  transport.send.push(Buffer.from('hello.'))
})

