const fs = require('fs');
const p = 'deploy-token.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('REST API confirmed txid1')) { console.log('already patched'); process.exit(0); }

const oldGate = `  let mUtxo = null;
  for (let i = 0; i < 36 && !mUtxo; i++) {
    try {
      const res = await fetchRetry('https://kascov.io/data/testnet-10/c/' + C + '.json');
      if (!res.ok) throw new Error('not found');
      const cov = await res.json();
      mUtxo = cov.utxos && cov.utxos.find(u => u.live && u.script_hex === minterSpk);
    } catch (e) {}
    if (!mUtxo) { console.log('  gate: C not live yet (' + (i + 1) + '/36)'); await new Promise(r => setTimeout(r, 5000)); }
  }`;

const newGate = `  let mUtxo = null;
  for (let i = 0; i < 12 && !mUtxo; i++) {
    try {
      const res = await fetchRetry('https://kascov.io/data/testnet-10/c/' + C + '.json');
      if (!res.ok) throw new Error('not found');
      const cov = await res.json();
      mUtxo = cov.utxos && cov.utxos.find(u => u.live && u.script_hex === minterSpk);
    } catch (e) {}
    if (!mUtxo) {
      console.log('  gate: C not live in kascov yet (' + (i + 1) + '/12), trying REST fallback...');
      try {
        const txRes = await fetchRetry('https://api-tn10.kaspa.org/transactions/' + txid1);
        if (txRes.ok) {
          const tx = await txRes.json();
          if (tx.is_accepted && tx.outputs && tx.outputs[0] && tx.outputs[0].script_public_key === minterSpk && tx.outputs[0].covenant_id === C) {
            console.log('  REST API confirmed txid1 output 0! Bypassing kascov gate.');
            mUtxo = { outpoint: txid1 + ':0', value: tx.outputs[0].amount, script_hex: minterSpk };
          }
        }
      } catch (e2) {}
      if (!mUtxo) await new Promise(r => setTimeout(r, 5000));
    }
  }`;

if (!s.includes(oldGate)) { console.error('anchor not found'); process.exit(1); }
s = s.split(oldGate).join(newGate);
fs.writeFileSync(p, s);
console.log('patched deploy-token.js with REST API fallback gate');
