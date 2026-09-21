const fs = require('fs');
const p = 'offer-lib.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('async function broadcastREST')) { console.log('already patched'); process.exit(0); }
const anchor = 'async function feeLoop(buildFn, initialFee = 3000000n) {';
if (!s.includes(anchor)) { console.error('anchor not found'); process.exit(1); }

const restFn = `async function broadcastREST(rpcTx) {
  try {
    const res = await fetch(N.rest + '/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' },
      body: JSON.stringify({ transaction: rpcTx, allowOrphan: false })
    });
    const text = await res.text();
    let txId = null, msg = '';
    try {
      const j = JSON.parse(text);
      if (res.ok) { txId = j.transactionId || j.id || null; msg = txId ? 'accepted' : text.substring(0, 240); }
      else { msg = (j.message || j.error || text).substring(0, 240); }
    } catch (e) { msg = text.substring(0, 240); }
    return { txId, msg };
  } catch (e) { return { txId: null, msg: e.message }; }
}

`;
s = s.split(anchor).join(restFn + anchor);
fs.writeFileSync(p, s);
console.log('patched offer-lib.js: added broadcastREST before feeLoop');
