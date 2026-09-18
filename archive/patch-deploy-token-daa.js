const fs = require('fs');
const p = 'deploy-token.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('j.daaScore !== undefined')) { console.log('already patched'); process.exit(0); }
const a1 = "const j = await (await fetchRetry('https://api-tn10.kaspa.org/info/daa-score')).json(); return BigInt(j.daaScore);";
if (!s.includes(a1)) { console.error('anchor1 not found'); process.exit(1); }
s = s.split(a1).join("const j = await (await fetchRetry('https://api-tn10.kaspa.org/info/daa-score')).json(); const v = j.daaScore !== undefined ? j.daaScore : (j.score !== undefined ? j.score : j.daa_score); if (v === undefined || v === null) return null; return BigInt(v);");
const a2 = "const conf = u.filter(x => x.utxoEntry.blockDaaScore && BigInt(x.utxoEntry.blockDaaScore) <= daa - 2n);";
if (!s.includes(a2)) { console.error('anchor2 not found'); process.exit(1); }
s = s.split(a2).join("const conf = daa === null ? u.filter(x => x.utxoEntry.blockDaaScore && BigInt(x.utxoEntry.blockDaaScore) > 0n) : u.filter(x => x.utxoEntry.blockDaaScore && BigInt(x.utxoEntry.blockDaaScore) <= daa - 2n);");
fs.writeFileSync(p, s);
console.log('patched deploy-token.js: schema-tolerant daaNow + presence fallback');
