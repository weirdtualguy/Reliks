const fs = require('fs');
const p = 'offer-lib.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('function toRESTFormat')) { console.log('already patched'); process.exit(0); }

const anchor = 'async function broadcastREST(rpcTx) {';
if (!s.includes(anchor)) { console.error('anchor not found'); process.exit(1); }

const transformFn = `function toRESTFormat(tx) {
  return {
    ...tx,
    outputs: tx.outputs.map(o => ({
      amount: o.value,
      scriptPublicKey: { scriptPublicKey: o.scriptPublicKey, version: 0 },
      ...(o.covenant ? { covenant: o.covenant } : {})
    }))
  };
}

`;

s = s.split(anchor).join(transformFn + anchor);
// Now modify the POST body to use the transformed tx
s = s.replace(
  'body: JSON.stringify({ transaction: rpcTx, allowOrphan: false })',
  'body: JSON.stringify({ transaction: toRESTFormat(rpcTx), allowOrphan: false })'
);
fs.writeFileSync(p, s);
console.log('patched offer-lib.js: toRESTFormat transforms tx outputs for v1 REST API schema');
