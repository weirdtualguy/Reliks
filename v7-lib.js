const N = require('./network.js');
const L = require('./offer-lib.js');
const { blake2b } = require('@noble/hashes/blake2b');
const WebSocket = require('ws');
const covIdGenesis = (authTxId, authIdx, outs) => L.hex(blake2b(L.B.concat([L.H(authTxId), L.le32(authIdx), L.le64(outs.length), ...outs.map(o => L.B.concat([L.le32(o.idx), L.le64(o.value), L.le16(0), L.le64(L.H(o.script).length), L.H(o.script)]))]), { dkLen: 32, key: L.B.from('CovenantID') }));
const serialOf = (txId, idx) => {
  const h = blake2b(L.B.concat([L.B.from('PixelCoveSerialV7', 'utf8'), L.H(txId), L.le32(idx)]), { dkLen: 32 });
  let s = 0n;
  for (let i = 0; i < 7; i++) s += BigInt(h[i]) * (256n ** BigInt(i));
  s += BigInt(h[7] & 0x7f) * (256n ** 7n);
  return s.toString();
};

async function broadcastREST(rpcTx) {
  try {
    const res = await fetch(N.rest + '/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Origin': 'https://wallet.kaspanet.io'
      },
      body: JSON.stringify({ transaction: rpcTx, allowOrphan: false })
    });
    const text = await res.text();
    let txId = null, msg = '';
    try {
      const j = JSON.parse(text);
      if (res.ok) {
        txId = j.transactionId || j.id || null;
        msg = txId ? 'accepted' : text.substring(0, 240);
      } else {
        msg = (j.message || j.error || text).substring(0, 240);
      }
    } catch (e) { msg = text.substring(0, 240); }
    return { txId, msg };
  } catch (e) {
    return { txId: null, msg: e.message };
  }
}
async function feeLoop(buildFn) {
  let fee = 3000000n;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await broadcastREST(buildFn(fee));
    if (res.txId) return { txId: res.txId, fee };
    console.log('  attempt ' + attempt + ' rejected: ' + res.msg);
    const m = res.msg.match(/required fee of (\d+)/i) || res.msg.match(/under the required (\d+)/i) || res.msg.match(/required fee[^\d]*(\d+)/i);
    if (m) fee = BigInt(m[1]) + BigInt(m[1]) / 10n + 1n;
    else if (/fee/i.test(res.msg)) fee = fee * 2n;
    else throw new Error('non-fee rejection: ' + res.msg);
  }
  throw new Error('fee discovery exhausted');
}

module.exports = { ...L, blake2b, covIdGenesis, serialOf, DUST: 100000000n };
