const fs = require('fs');
let code = fs.readFileSync('v7-lib.js', 'utf8');

const REST_FUNC = `async function broadcastWithMsg(rpcTx) {
  const url = N.rest + '/transactions?replaceByFee=false';
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ transaction: rpcTx, allowOrphan: true })
    });
    if (r.ok) {
      const j = await r.json();
      return { txId: j.transactionId || j.transaction_id || null, msg: 'ok' };
    }
    const errTxt = await r.text();
    console.error('REST error [' + r.status + ']:', errTxt.slice(0, 400));
    return { txId: null, msg: 'HTTP ' + r.status };
  } catch (e) {
    return { txId: null, msg: 'fetch failed: ' + e.message };
  }
}`;

// Find the old broadcastWithMsg function and replace it entirely
const regex = /async function broadcastWithMsg[\s\S]*?\n\}\n/;
if (regex.test(code)) {
  code = code.replace(regex, REST_FUNC + '\n');
  fs.writeFileSync('v7-lib.js', code);
  console.log('✅ v7-lib.js patched: WebSocket replaced with REST broadcast');
} else {
  console.log('❌ Could not find broadcastWithMsg function in v7-lib.js');
}
