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
async function broadcastWithMsg(rpcTx) {
  let WsCtor;
  try { WsCtor = require('ws'); } catch (e) { WsCtor = WebSocket; }
  return new Promise((resolve) => {
    const tryUrl = (k) => {
      if (k >= N.wrpc.length) { resolve({ txId: null, msg: 'all endpoints failed' }); return; }
      const ws = new WsCtor(N.wrpc[k], { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
      const t = setTimeout(() => { console.log('  wrpc timeout [' + N.wrpc[k] + ']'); ws.terminate(); tryUrl(k + 1); }, 15000);
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction: rpcTx, allowOrphan: true } })));
      ws.on('message', d => { const s = d.toString(); clearTimeout(t); let txId = null, msg = ''; try { const j = JSON.parse(s); txId = (j.params || j.result || {}).transactionId || null; msg = (j.error && j.error.message) || s.substring(0, 240); } catch (e) { msg = s.substring(0, 240); } ws.close(); resolve({ txId, msg }); });
      ws.on('error', (e) => { clearTimeout(t); console.error('  wrpc error [' + N.wrpc[k] + ']:', e.message); tryUrl(k + 1); });
    };
    tryUrl(0);
  });
}
async function feeLoop(buildFn) {
  let fee = 3000000n;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await broadcastWithMsg(buildFn(fee));
    if (res.txId) return { txId: res.txId, fee };
    console.log('  attempt ' + attempt + ' rejected: ' + res.msg);
    const m = res.msg.match(/required fee of (\d+)/i) || res.msg.match(/under the required (\d+)/i) || res.msg.match(/required fee[^\d]*(\d+)/i);
    if (m) fee = BigInt(m[1]) + BigInt(m[1]) / 10n + 1n;
    else if (/fee/i.test(res.msg)) fee = fee * 2n;
    else throw new Error('non-fee rejection: ' + res.msg);
  }
  throw new Error('fee discovery exhausted');
}
module.exports = { ...L, blake2b, covIdGenesis, serialOf, broadcastWithMsg, feeLoop, DUST: 100000000n };
