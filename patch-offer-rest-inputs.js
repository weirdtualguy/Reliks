const fs = require('fs');
const p = 'offer-lib.js';
let s = fs.readFileSync(p, 'utf8');

const OLD_FORMAT = `function toRESTFormat(tx) {
  const stripVer = (spk) => (typeof spk === 'string' && spk.slice(0,4) === '0000') ? spk.slice(4) : spk;
  return {
    ...tx,
    outputs: tx.outputs.map(o => ({
      amount: o.value,
      scriptPublicKey: { scriptPublicKey: stripVer(o.scriptPublicKey), version: 0 },
      ...(o.covenant ? { covenant: o.covenant } : {})
    }))
  };
}`;

const NEW_FORMAT = `function toRESTFormat(tx) {
  const stripVer = (spk) => (typeof spk === 'string' && spk.slice(0,4) === '0000') ? spk.slice(4) : spk;
  return {
    version: tx.version || 1,
    inputs: (tx.inputs || []).map(i => ({
      previous_outpoint_hash: i.previousOutpoint ? i.previousOutpoint.transactionId : (i.previous_outpoint_hash || ''),
      previous_outpoint_index: i.previousOutpoint ? i.previousOutpoint.index : (i.previous_outpoint_index || 0),
      signature_script: i.signatureScript || i.signature_script || '',
      sequence: i.sequence || 0,
      sig_op_count: i.sigOpCount !== undefined ? i.sigOpCount : (i.sig_op_count || 0),
      compute_budget: i.computeBudget !== undefined ? i.computeBudget : (i.compute_budget || 10)
    })),
    outputs: (tx.outputs || []).map(o => {
      const out = {
        amount: o.value !== undefined ? o.value : o.amount,
        script_public_key: { scriptPublicKey: stripVer(o.scriptPublicKey), version: 0 }
      };
      if (o.covenant) {
        out.covenant_authorizing_input = o.covenant.authorizingInput !== undefined ? o.covenant.authorizingInput : o.covenant.authorizing_input;
        out.covenant_id = o.covenant.covenantId || o.covenant.covenant_id;
      }
      return out;
    }),
    lock_time: tx.lockTime !== undefined ? tx.lockTime : (tx.lock_time || 0),
    subnetwork_id: tx.subnetworkId || tx.subnetwork_id || '00'.repeat(20),
    gas: tx.gas !== undefined ? tx.gas : 0,
    payload: tx.payload || ''
  };
}`;

if (!s.includes(OLD_FORMAT)) { console.error('toRESTFormat anchor not found'); process.exit(1); }
s = s.split(OLD_FORMAT).join(NEW_FORMAT);
fs.writeFileSync(p, s);
console.log('patched offer-lib.js: toRESTFormat now maps inputs to snake_case REST schema (compute_budget, previous_outpoint_hash, etc.)');
