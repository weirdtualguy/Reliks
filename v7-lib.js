const N = require('./network.js');
const L = require('./offer-lib.js');
const { blake2b } = require('@noble/hashes/blake2b');
const WebSocket = require('ws');
const covIdGenesis = (authTxId, authIdx, outs) => L.hex(blake2b(L.B.concat([L.H(authTxId), L.le32(authIdx), L.le64(outs.length), ...outs.map(o => L.B.concat([L.le32(o.idx), L.le64(o.value), L.le16(0), L.le64(L.H(o.script).length), L.H(o.script)]))]), { dkLen: 32, key: L.B.from('CovenantID') }));

module.exports = { ...L, blake2b, covIdGenesis, DUST: 100000000n };
