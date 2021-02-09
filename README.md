# handshake-peer

Handshake protocol-agnostic end-to-end encrypted, secure channels.

## Usage

```js
// use existing trasnport sreams between peers, eg. htp
const transport = { req, res }

// instantiate client
const client = new Handshakepeer({ localId }, { remoeId }, transport, {
  handshake: [
    function (self) {
      // init logic
      return dataToTransmit
    },
    function (data, self) {
      // implement subsequent handshake logic
      return dataToTransmit
    },
    ...
  ]
})

// instantiate server
const server = new HandshakePeer( ... )
  .on('data', d => console.log(d.toSring()))

client.write('hello, server!')
// [server] >hello, server!
```

## API

#### `const stream = new HandshakePeer(localInfo, remoteInfo, { req, res }, opts)`

Instantiate a channel. Returns a Duplex stream which plaintext may be written to and read from. `localInfo` and `remoteInfo` store any state needed by the defined handshake. `req` should be a readable stream and `res` a writable stream connected to another peer.

A handshake protocol is given to `opts.handshake` and should give an array of functions defining the users actions during each step of the handshake.

All functions should either return the binary data required by the remote peer to continue the protocol, or should not return if there is no data to be sent.

The first of these functions has the signature: `function (self)` and is to initialise the handshake state, which may be accessed by `self.handshakeState`.

The subsequent functions all have the signature: `function (data, self)`. By the end of the protocol, `self.keys.local` and `self.keys.remote` must be populated with keys of `KEYBYTES` length.

#### `const client.write(plaintext)`

Send `plaintext` to the peer via the encrypted channel. `plaintext` should be a `Buffer` or `Uin8Array`

#### `client.on('data', plaintext)`

Lisen for messages from the remote peer

