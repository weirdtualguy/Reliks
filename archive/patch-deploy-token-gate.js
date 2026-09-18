const fs = require('fs');
const p = 'deploy-token.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('if (!res.ok) throw new Error')) { console.log('already patched'); process.exit(0); }
const oldGate = `  let mUtxo = null;
  for (let i = 0; i < 24 && !mUtxo; i++) {
    const cov = await (await fetchRetry('https://kascov.io/data/testnet-10/c/' + C + '.json')).json();
    mUtxo = cov.utxos && cov.utxos.find(u => u.live && u.script_hex === minterSpk);
    if (!mUtxo) { console.log('  gate: C not live yet (' + (i + 1) + '/24)'); await new Promise(r => setTimeout(r, 5000)); }
  }`;
const newGate = `  let mUtxo = null;
  for (let i = 0; i < 36 && !mUtxo; i++) {
    try {
      const res = await fetchRetry('https://kascov.io/data/testnet-10/c/' + C + '.json');
      if (!res.ok) throw new Error('not found');
      const cov = await res.json();
      mUtxo = cov.utxos && cov.utxos.find(u => u.live && u.script_hex === minterSpk);
    } catch (e) {}
    if (!mUtxo) { console.log('  gate: C not live yet (' + (i + 1) + '/36)'); await new Promise(r => setTimeout(r, 5000)); }
  }`;
if (!s.includes(oldGate)) { console.error('anchor not found'); process.exit(1); }
s = s.split(oldGate).join(newGate);
fs.writeFileSync(p, s);
console.log('patched deploy-token.js gate to handle kascov 404 plain text');
