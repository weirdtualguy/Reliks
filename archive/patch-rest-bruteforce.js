const fs = require('fs');
const REST_IMPL = `async function broadcastWithMsg(rpcTx) {
  const restTx = {
    version: rpcTx.version || 0,
    inputs: (rpcTx.inputs || []).map(i => Object.assign({
      previousOutpoint: i.previousOutpoint,
      signatureScript: i.signatureScript,
      sequence: i.sequence || 0,
      sigOpCount: i.sigOpCount || 0
    }, i.computeBudget !== undefined ? { computeBudget: i.computeBudget } : {})),
    outputs: (rpcTx.outputs || []).map(o => Object.assign({
      amount: (o.amount !== undefined ? o.amount : o.value),
      scriptPublicKey: (typeof o.scriptPublicKey === 'string')
        ? { version: parseInt(o.scriptPublicKey.slice(0, 4), 16) || 0, scriptPublicKey: o.scriptPublicKey.slice(4) }
        : o.scriptPublicKey
    }, o.covenant ? { covenant: o.covenant } : {})),
    lockTime: rpcTx.lockTime || 0,
    subnetworkId: rpcTx.subnetworkId || '00'.repeat(20)
  };
  if (rpcTx.gas !== undefined) restTx.gas = rpcTx.gas;
  if (rpcTx.payload !== undefined) restTx.payload = rpcTx.payload;
  const url = N.rest + '/transactions?replaceByFee=false';
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ transaction: restTx, allowOrphan: true }) });
    const txt = await r.text();
    if (r.ok) {
      let j = {}; try { j = JSON.parse(txt); } catch (e) {}
      const txId = j.transactionId || j.transaction_id || null;
      return { txId, msg: txId ? 'ok' : ('no txId in response: ' + txt.slice(0, 200)) };
    }
    console.error('  REST broadcast error [' + r.status + ']:', txt.slice(0, 400));
    return { txId: null, msg: txt.slice(0, 300) };
  } catch (e) {
    return { txId: null, msg: 'fetch failed: ' + e.message };
  }
}`;
function replaceFn(code, re) {
  const m = code.match(re);
  if (!m) return null;
  const brace = code.indexOf('{', m.index);
  if (brace === -1) return null;
  let depth = 0, end = -1;
  for (let j = brace; j < code.length; j++) {
    if (code[j] === '{') depth++;
    else if (code[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  if (end === -1) return null;
  return code.slice(0, m.index) + REST_IMPL + code.slice(end + 1);
}
let patched = false;
for (const file of ['v7-lib.js', 'offer-lib.js']) {
  let code = fs.readFileSync(file, 'utf8');
  const out = replaceFn(code, /async\s+function\s+broadcastWithMsg\s*\(/) || replaceFn(code, /function\s+broadcastWithMsg\s*\(/) || replaceFn(code, /const\s+broadcastWithMsg\s*=\s*async\s*\(/);
  if (out) { fs.writeFileSync(file, out); console.log('✅ replaced broadcastWithMsg in', file); patched = true; }
  else {
    const i = code.indexOf('broadcastWithMsg');
    if (i >= 0) { console.log('⚠️ ' + file + ' mentions broadcastWithMsg but no definition matched. Context:'); console.log(code.slice(Math.max(0, i - 300), i + 300)); }
    else console.log('⚠️ ' + file + ' contains no broadcastWithMsg');
  }
}
if (!patched) process.exit(1);
