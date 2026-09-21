const fs = require('fs');
const p = 'deploy-v10.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('Skipping ghost UTXO')) { console.log('already patched'); process.exit(0); }
const anchor = 'const wIn = await pickUtxo();';
if (!s.includes(anchor)) { console.error('anchor not found'); process.exit(1); }
const replacement = `let wIn = await pickUtxo();
  // Skip ghost UTXO that REST API hasn't cleared from the mempool yet
  if (wIn.txId === 'c29396976c0dec416a32da3a087b42d06b78ae62e0334212846ca36c3084bdda' && wIn.index === 1) {
    console.log('Skipping ghost UTXO c29396...:1 (likely spent in mempool)');
    const allUtxos = await (await fetch(V.rest + '/addresses/' + V.WALLET + '/utxos')).json();
    const confirmed = allUtxos.filter(x => x.utxoEntry && x.utxoEntry.blockDaaScore).sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
    const next = confirmed.find(u => !(u.outpoint.transactionId === 'c29396976c0dec416a32da3a087b42d06b78ae62e0334212846ca36c3084bdda' && u.outpoint.index === 1));
    if (!next) throw new Error('no other UTXOs available');
    wIn = { txId: next.outpoint.transactionId, index: next.outpoint.index, spk: '20' + V.USER + 'ac', amount: BigInt(next.utxoEntry.amount) };
    console.log('Selected next UTXO:', wIn.txId.slice(0, 8) + '... | amount:', Number(wIn.amount)/1e8, 'TKAS');
  }`;
s = s.split(anchor).join(replacement);
fs.writeFileSync(p, s);
console.log('patched deploy-v10.js: skips ghost UTXO c29396...:1');
