const fs = require('fs');
const p = 'mint-art-v6.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('REST API confirmed genesis')) { console.log('already patched'); process.exit(0); }

const oldGate = `  let futxo;
  for (let i = 0; i < 24; i++) {
    const cov = await (await fetchRetry('https://kascov.io/data/testnet-10/c/' + LEDGER.covenantId + '.json')).json();
    futxo = cov.utxos.find(u => u.live && u.script_hex === curFSpk);
    if (futxo) break;
    console.log('  indexer lag: factory spk not live yet (' + (i + 1) + '/24)');
    await new Promise(r => setTimeout(r, 5000));
  }
  if (!futxo) { console.error('❌ factory spk drift/persistent lag:', curFSpk); process.exit(1); }`;

const newGate = `  let futxo;
  const gTxId = LEDGER.genesisTxId || LEDGER.txId;
  for (let i = 0; i < 12; i++) {
    try {
      const res = await fetchRetry('https://kascov.io/data/testnet-10/c/' + LEDGER.covenantId + '.json');
      if (res.ok) {
        const cov = await res.json();
        futxo = cov.utxos.find(u => u.live && u.script_hex === curFSpk);
        if (futxo) break;
      }
    } catch (e) {}
    
    if (!futxo) {
      console.log('  indexer lag: factory spk not live yet (' + (i + 1) + '/12), trying REST fallback...');
      try {
        const txRes = await fetchRetry('https://api-tn10.kaspa.org/transactions/' + gTxId);
        if (txRes.ok) {
          const tx = await txRes.json();
          if (tx.is_accepted && tx.outputs && tx.outputs[0] && tx.outputs[0].script_public_key === curFSpk) {
            console.log('  REST API confirmed genesis output 0! Bypassing kascov gate.');
            futxo = { outpoint: gTxId + ':0', value: tx.outputs[0].amount, script_hex: curFSpk };
            break;
          }
        }
      } catch (e2) {}
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  if (!futxo) { console.error('❌ factory spk drift/persistent lag:', curFSpk); process.exit(1); }`;

if (!s.includes(oldGate)) { console.error('anchor not found'); process.exit(1); }
s = s.split(oldGate).join(newGate);
fs.writeFileSync(p, s);
console.log('patched mint-art-v6.js with REST API fallback gate');
