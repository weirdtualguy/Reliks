const fs = require('fs');
let s = fs.readFileSync('secondary-v4.js', 'utf8');
const OLD = "const edIn = { txId: ed.txId, index: ed.index, sequence: 0, spk: V.p2sh(curRedeem), amount: DUST };";
const NEW = OLD + "\n  if (ed.spk && hex(edIn.spk) !== ed.spk) throw new Error('F-B17 template drift: ledger spk ' + ed.spk.slice(0, 18) + '... != recomputed ' + hex(edIn.spk).slice(0, 18) + '... — on-chain edition bound to a different template than the on-disk ABI');";
if (!s.includes(OLD)) { console.log('❌ anchor missing'); process.exit(1); }
fs.writeFileSync('secondary-v4.js', s.split(OLD).join(NEW));
console.log('✅ secondary-v4 now asserts ledger spk == recomputed spk before signing');
