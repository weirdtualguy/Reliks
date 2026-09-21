const fs = require('fs');
const p = 'deploy-v10.js';
let s = fs.readFileSync(p, 'utf8');

// 1. Upgrade initial pick to use pickUtxoSafe (oldest DAA first)
if (s.includes('let wIn = await pickUtxo();')) {
  s = s.replace('let wIn = await pickUtxo();', 'let wIn = await (V.pickUtxoSafe ? V.pickUtxoSafe() : pickUtxo());');
} else if (s.includes('const wIn = await pickUtxo();')) {
  s = s.replace('const wIn = await pickUtxo();', 'let wIn = await (V.pickUtxoSafe ? V.pickUtxoSafe() : pickUtxo());');
}

// 2. Fix the manual fallback to sort by DAA score (oldest first) instead of amount descending
const oldSort = "sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)))";
const newSort = "sort((a, b) => Number(BigInt(a.utxoEntry.blockDaaScore) - BigInt(b.utxoEntry.blockDaaScore)))";
if (s.includes(oldSort)) {
  s = s.split(oldSort).join(newSort);
}

fs.writeFileSync(p, s);
console.log('patched deploy-v10.js: uses pickUtxoSafe + DAA-sorted fallback (F-05 guard active)');
