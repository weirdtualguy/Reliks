const fs = require('fs');
let s = fs.readFileSync('v7-lib.js', 'utf8');

// Remove the old WebSocket broadcaster
s = s.replace(/async function broadcastWithMsg\(rpcTx\) \{[\s\S]*?\n\}\n/, '');
// Remove the old feeLoop that only uses WebSocket
s = s.replace(/async function feeLoop\(buildFn\) \{[\s\S]*?\n\}\n/, '');
// Clean up module.exports
s = s.replace(/broadcastWithMsg, feeLoop, /, '');

const restBroadcast = `
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
    const m = res.msg.match(/required fee of (\\d+)/i) || res.msg.match(/under the required (\\d+)/i) || res.msg.match(/required fee[^\\d]*(\\d+)/i);
    if (m) fee = BigInt(m[1]) + BigInt(m[1]) / 10n + 1n;
    else if (/fee/i.test(res.msg)) fee = fee * 2n;
    else throw new Error('non-fee rejection: ' + res.msg);
  }
  throw new Error('fee discovery exhausted');
}
`;

s = s.replace('module.exports', restBroadcast + '\nmodule.exports');
fs.writeFileSync('v7-lib.js', s);
console.log('patched v7-lib.js: feeLoop now uses REST API (bypasses broken wRPC seeders)');
