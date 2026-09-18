const fs = require('fs');

const EXACT_REST_IMPL = `async function broadcastWithMsg(rpcTx) {
  const restTx = {
    version: rpcTx.version || 0,
    inputs: (rpcTx.inputs || []).map(i => ({
      previous_outpoint_hash: i.previousOutpoint.transactionId,
      previous_outpoint_index: i.previousOutpoint.index,
      signature_script: i.signatureScript,
      sequence: i.sequence || 0,
      sig_op_count: i.sigOpCount || 0,
      compute_budget: i.computeBudget || 0
    })),
    outputs: (rpcTx.outputs || []).map(o => {
      const out = {
        amount: (o.amount !== undefined ? o.amount : o.value),
        script_public_key: (typeof o.scriptPublicKey === 'string') ? o.scriptPublicKey : (o.scriptPublicKey.scriptPublicKey || o.scriptPublicKey)
      };
      if (o.covenant) {
        out.covenant_authorizing_input = o.covenant.authorizingInput;
        out.covenant_id = o.covenant.covenantId;
      }
      return out;
    }),
    lock_time: rpcTx.lockTime || 0,
    subnetwork_id: rpcTx.subnetworkId || '00'.repeat(20)
  };
  if (rpcTx.gas !== undefined) restTx.gas = rpcTx.gas;
  if (rpcTx.payload !== undefined) restTx.payload = rpcTx.payload;
  
  const url = N.rest + '/transactions?replaceByFee=false';
  try {
    const r = await fetch(url, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, 
      body: JSON.stringify({ transaction: restTx, allowOrphan: true }) 
    });
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

function replaceFn(code) {
  const re = /async\s+function\s+broadcastWithMsg\s*\(/;
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
  return code.slice(0, m.index) + EXACT_REST_IMPL + code.slice(end + 1);
}

for (const file of ['v7-lib.js', 'offer-lib.js']) {
  let code = fs.readFileSync(file, 'utf8');
  const out = replaceFn(code);
  if (out) { 
    fs.writeFileSync(file, out); 
    console.log('✅ replaced broadcastWithMsg in', file, 'with exact openapi.json schema'); 
  } else {
    console.log('❌ could not find broadcastWithMsg in', file);
  }
}
