const fs = require('fs');
const p = 'deploy-v11.js';
let s = fs.readFileSync(p, 'utf8');
const old = "const t = covHex(covIdGenesis(w0.txId, w0.index, [{ idx: 1, value: Number(LD2.editions[0].amount), script: LD2.editions[0].spk }]));";
const neu = "const edOut0 = m0.outputs[1];\n  const edScript0 = (() => { const x = edOut0.script_public_key || edOut0.scriptPublicKey; return typeof x === 'string' ? x : (x.scriptPublicKey || ''); })();\n  const t = covHex(covIdGenesis(w0.txId, w0.index, [{ idx: 1, value: Number(edOut0.amount), script: edScript0 }]));";
if (!s.includes(old)) { console.error('self-test anchor not found'); process.exit(1); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log('self-test now sources authorized-output spec from chain (immune to ledger double-hex)');
