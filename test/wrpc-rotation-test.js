// Regression: a wRPC endpoint that times out while still connecting must rotate to the next endpoint exactly once
// (terminate() on a connecting socket also emits 'error'; the old code then tried the next endpoint twice).
'use strict';
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');
const { secp256k1 } = require('@noble/curves/secp256k1');
const { encodeP2PK } = require('../lib/bech32-kaspa.js');

let bad = 0;
const t = (name, ok, detail) => { if (!ok) bad = 1; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' | ' + (detail || ''))); };

(async () => {
  // Endpoint 1: accepts TCP, never answers the WebSocket handshake (stays CONNECTING until the timeout).
  const hang = net.createServer((s) => { s.on('error', () => {}); });
  await new Promise((r) => hang.listen(0, '127.0.0.1', r));
  // Endpoint 2: real WebSocket server; counts connections and answers with a tx id.
  let conns = 0;
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((r) => wss.on('listening', r));
  wss.on('connection', (ws) => {
    conns++;
    ws.on('message', () => ws.send(JSON.stringify({ id: 1, result: { transactionId: 'ab'.repeat(32) } })));
  });
  const priv = '11'.repeat(32);
  const pub = Buffer.from(secp256k1.getPublicKey(Buffer.from(priv, 'hex'), true)).subarray(1, 33).toString('hex');
  const env = Object.assign({}, process.env, {
    PC_NET: 'testnet', PC_PRIV: priv, PC_WALLET: encodeP2PK('kaspatest', pub),
    PC_TESTNET_WRPC: 'ws://127.0.0.1:' + hang.address().port + ',ws://127.0.0.1:' + wss.address().port,
    PC_WRPC_TIMEOUT_MS: '300'
  });
  const code = "require('./lib/reliks-lib.js').broadcastWithMsg({}).then(r=>{console.log('RESULT '+JSON.stringify(r));process.exit(0)})";
  const out = await new Promise((resolve) => {
    let buf = ''; const c = spawn(process.execPath, ['-e', code], { cwd: path.join(__dirname, '..'), env });
    c.stdout.on('data', (d) => { buf += d; }); c.stderr.on('data', (d) => { buf += d; });
    c.on('close', () => resolve(buf));
  });
  await new Promise((r) => setTimeout(r, 400));
  t('rotates past the hung endpoint and returns the tx id', /RESULT .*abab/.test(out), out.slice(0, 300));
  t('next endpoint is contacted exactly once', conns === 1, 'connections: ' + conns);
  hang.close(); wss.close();
  console.log(bad ? '\nwrpc-rotation-test: FAILED' : '\nwrpc-rotation-test: 2 passed, 0 failed');
  process.exit(bad);
})();
