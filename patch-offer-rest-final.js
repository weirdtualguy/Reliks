const fs = require('fs');
const p = 'offer-lib.js';
let s = fs.readFileSync(p, 'utf8');

// Find the current toRESTFormat function and replace it entirely
const startIdx = s.indexOf('function toRESTFormat(tx) {');
if (startIdx === -1) { console.error('toRESTFormat not found'); process.exit(1); }

let depth = 0, endIdx = -1;
for (let i = s.indexOf('{', startIdx); i < s.length; i++) {
  if (s[i] === '{') depth++;
  else if (s[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
}
if (endIdx === -1) { console.error('could not find end of toRESTFormat'); process.exit(1); }

const NEW_FORMAT = `function toRESTFormat(tx) {
  const stripVer = (spk) => (typeof spk === 'string' && spk.slice(0,4) === '0000') ? spk.slice(4) : spk;
  return {
    version: tx.version || 1,
    inputs: (tx.inputs || []).map(i => ({
      previousOutpoint: i.previousOutpoint,
      signatureScript: i.signatureScript,
      sequence: i.sequence,
      sigOpCount: i.sigOpCount,
      computeBudget: i.computeBudget,
      compute_budget: i.computeBudget
    })),
    outputs: (tx.outputs || []).map(o => {
      const out = {
        amount: o.value !== undefined ? o.value : o.amount,
        scriptPublicKey: {
          scriptPublicKey: stripVer(o.scriptPublicKey),
          version: 0
        }
      };
      if (o.covenant) {
        out.covenant = {
          authorizingInput: o.covenant.authorizingInput,
          covenantId: o.covenant.covenantId,
          authorizing_input: o.covenant.authorizingInput,
          covenant_id: o.covenant.covenantId
        };
      }
      return out;
    }),
    lockTime: tx.lockTime || 0,
    subnetworkId: tx.subnetworkId || '00'.repeat(20),
    gas: tx.gas || 0,
    payload: tx.payload || ''
  };
}`;

s = s.slice(0, startIdx) + NEW_FORMAT + s.slice(endIdx);
fs.writeFileSync(p, s);
console.log('patched offer-lib.js: toRESTFormat now uses exact camelCase inputs + dual-format v1 fields');
