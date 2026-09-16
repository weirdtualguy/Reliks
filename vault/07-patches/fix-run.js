const fs = require('fs');
let c = fs.readFileSync('src/m2-run.ts', 'utf8');
// preflight body: RAW script bytes (kascov dialect)
c = c.split('script: spkFlat(plan.utxos[k].spk)').join('script: plan.utxos[k].spk');
c = c.split('scriptPublicKey: spkFlat(o.scriptPublicKey.scriptPublicKey)')
     .join('scriptPublicKey: { version: 0, script: o.scriptPublicKey.scriptPublicKey }');
// broadcast body: FLAT version-prefixed strings (node-native dialect)
c = c.split('const transaction = { ...plan.transaction, mass: pf.masses.storage };')
     .join(`const transaction = { ...plan.transaction, mass: pf.masses.storage,
    outputs: plan.transaction.outputs.map((o: any) => ({ ...o, scriptPublicKey: '0000' + o.scriptPublicKey.scriptPublicKey })) };`);
fs.writeFileSync('src/m2-run.ts', c);
console.log('✅ m2-run.ts: preflight=raw, broadcast=flat');
