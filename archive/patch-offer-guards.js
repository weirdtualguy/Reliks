const fs = require('fs');
let s = fs.readFileSync('offer-lib.js', 'utf8');
if (!s.includes('PC_WALLET prefix mismatch')) {
  s = s.replace(/const WALLET = process\.env\.PC_WALLET \|\|[^\n]*\n/, m => m + "if (!WALLET.startsWith(N.hrp + ':')) { console.error('FATAL: PC_WALLET prefix mismatch for PC_NET=' + N.NET + ' (wallet: ' + WALLET.slice(0, 12) + '..., expected prefix ' + N.hrp + ':)'); process.exit(1); }\n");
}
if (!s.includes('non-array UTXO response')) {
  s = s.split('const conf = w.filter(x => x.utxoEntry.blockDaaScore);').join("if (!Array.isArray(w)) throw new Error('non-array UTXO response: ' + JSON.stringify(w).slice(0, 200));\n  const conf = w.filter(x => x.utxoEntry.blockDaaScore);");
}
fs.writeFileSync('offer-lib.js', s);
console.log('offer-lib hardened: wallet-prefix guard + UTXO shape guard');
