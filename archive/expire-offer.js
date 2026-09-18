const L = require('./offer-lib.js');
const WebSocket = require('ws');
const { B, hex, H, pushMin, pushMinInt, sighash, parts, encState, pickUtxo, secp, fs } = L;
function broadcastWithMsg(rpcTx) {
  const urls = ['wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', 'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json'];
  return new Promise(resolve => {
    const tryUrl = k => {
      if (k >= urls.length) return resolve({ txId: null, msg: 'all endpoints failed' });
      const ws = new WebSocket(urls[k], { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
      const t = setTimeout(() => { ws.terminate(); tryUrl(k + 1); }, 15000);
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction: rpcTx, allowOrphan: true } })));
      ws.on('message', d => { const s = d.toString(); clearTimeout(t); let txId = null, msg = ''; try { const j = JSON.parse(s); txId = (j.params || j.result || {}).transactionId || null; msg = (j.error && j.error.message) || s.substring(0, 240); } catch (e) { msg = s.substring(0, 240); } ws.close(); resolve({ txId, msg }); });
      ws.on('error', () => { clearTimeout(t); tryUrl(k + 1); });
    };
    tryUrl(0);
  });
}
(async () => {
  const O = JSON.parse(fs.readFileSync('offer-ledger.json', 'utf8'));
  const K = JSON.parse(fs.readFileSync('offer-keys.json', 'utf8'));
  const Es = parts(JSON.parse(fs.readFileSync('offer-escrow-abi.json', 'utf8')));
  const TAG_EXPIRE = H(Es.c.entries.expire.dispatch_tag);
  const redeem = B.concat([Es.prefix, encState(Es, { edition_covid: O.editionCovId, amount: O.amount, offerer: O.offerer, expire_age: O.expireAge }), Es.suffix]);
  const escrowValue = BigInt(O.amount);
  const wIn = await pickUtxo();
  function build(fee) {
    const inputs = [
      { txId: O.txId, index: O.index, sequence: O.expireAge, spk: O.spk, amount: escrowValue },
      wIn
    ];
    const outputs = [
      { amount: escrowValue, scriptPublicKey: '20' + K.pub + 'ac' },
      { amount: wIn.amount - fee, scriptPublicKey: wIn.spk }
    ];
    const ssEsc = B.concat([pushMinInt(0), pushMin(TAG_EXPIRE), pushMin(redeem)]);
    const sigW = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), L.PRIV)) + '01';
    return { version: 1, inputs: [
        { previousOutpoint: { transactionId: O.txId, index: O.index }, signatureScript: hex(ssEsc), sequence: O.expireAge, sigOpCount: 0, computeBudget: 60 },
        { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sigW, sequence: 0, sigOpCount: 0, computeBudget: 10 }
      ], outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
  }
  let fee = 3000000n; let txId = null;
  for (let attempt = 0; attempt < 6 && !txId; attempt++) {
    const res = await broadcastWithMsg(build(fee));
    if (res.txId) { txId = res.txId; break; }
    console.log('  attempt ' + attempt + ' rejected: ' + res.msg);
    const m = res.msg.match(/required fee of (\d+)/i) || res.msg.match(/under the required (\d+)/i) || res.msg.match(/required fee[^\d]*(\d+)/i);
    if (m) fee = BigInt(m[1]) + BigInt(m[1]) / 10n + 1n;
    else if (/fee/i.test(res.msg)) fee = fee * 2n;
    else throw new Error('non-fee rejection: ' + res.msg);
  }
  if (!txId) throw new Error('expire broadcast failed after fee discovery');
  console.log('OFFER EXPIRED (permissionless refund):', txId, '| fee', fee.toString());
})().catch(e => { console.error(e); process.exit(1); });
