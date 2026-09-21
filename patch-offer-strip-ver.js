const fs = require('fs');
const p = 'offer-lib.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('stripVer')) { console.log('already patched'); process.exit(0); }

const OLD = `function toRESTFormat(tx) {
  return {
    ...tx,
    outputs: tx.outputs.map(o => ({
      amount: o.value,
      scriptPublicKey: { scriptPublicKey: o.scriptPublicKey, version: 0 },
      ...(o.covenant ? { covenant: o.covenant } : {})
    }))
  };
}`;

const NEW = `function toRESTFormat(tx) {
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

if (!s.includes(OLD)) { console.error('toRESTFormat anchor not found'); process.exit(1); }
s = s.split(OLD).join(NEW);
fs.writeFileSync(p, s);
console.log('patched offer-lib.js: strip 0000 version prefix from REST scriptPublicKey inner hex');
