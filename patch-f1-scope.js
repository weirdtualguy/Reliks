const fs = require('fs');
const p = 'verify-render-v10.js';
let s = fs.readFileSync(p, 'utf8');
const old = "const ss0_f1 = Buffer.from(mintTx.inputs[0].signature_script, 'hex');";
const neu = "const f1Tx = await (await fetch(V.rest + '/transactions/' + (LD.editions[0].mintTxId || LD.editions[0].txId))).json();\n   const ss0_f1 = Buffer.from(f1Tx.inputs[0].signature_script, 'hex');";
if (!s.includes(old)) { console.error('F1 injected anchor not found'); process.exit(1); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log('F1 gate now fetches its own mint tx (scope-safe, mintTxId-aware)');
