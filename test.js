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

const server = new SpakePeer.Server(serverId, username, registrationInfo, serverReq, serverRes)
const client = new SpakePeer.Client(username, password, serverId, serverRes, serverReq)

client.write('hello')
server.on('data', d => console.log('data', d))
