const fs = require('fs');
const p = 'deploy-v10.js';
let s = fs.readFileSync(p, 'utf8');

const startAnchor = 'let wIn = await (V.pickUtxoSafe ? V.pickUtxoSafe() : pickUtxo());';
const endAnchor = 'const C = V.covIdGenesis';

const startIdx = s.indexOf(startAnchor);
const endIdx = s.indexOf(endAnchor);
if (startIdx === -1) {
  console.error('start anchor not found. Current wIn lines:');
  console.error(s.split('\n').filter(l => l.includes('wIn =')).join('\n'));
  process.exit(1);
}
if (endIdx === -1 || startIdx >= endIdx) { console.error('end anchor missing or out of order'); process.exit(1); }

const replacement = `// F-05 robust funding: DEEPEST confirmed UTXO with enough for DUST + fee.
  const allUtxos = await (await fetch(V.rest + '/addresses/' + V.WALLET + '/utxos')).json();
  const MIN_FUND = DUST + 10000000n; // 1 KAS carrier + 0.1 KAS fee headroom
  const cands = (Array.isArray(allUtxos) ? allUtxos : [])
    .filter(x => x.utxoEntry && x.utxoEntry.blockDaaScore)
    .filter(x => BigInt(x.utxoEntry.amount) >= MIN_FUND)
    .sort((a, b) => Number(BigInt(a.utxoEntry.blockDaaScore) - BigInt(b.utxoEntry.blockDaaScore)));
  if (cands.length === 0) throw new Error('no deep, sufficient UTXO available');
  const pick = cands[0];
  const wIn = { txId: pick.outpoint.transactionId, index: pick.outpoint.index, sequence: 0, spk: '20' + V.USER + 'ac', amount: BigInt(pick.utxoEntry.amount) };
  console.log('Funding from DEEPEST sufficient UTXO:', wIn.txId.slice(0,10) + '...:' + wIn.index, '| amount:', Number(wIn.amount)/1e8, 'TKAS | daa:', pick.utxoEntry.blockDaaScore);
  await waitForConfirmation(wIn.txId);
  `;

s = s.slice(0, startIdx) + replacement + s.slice(endIdx);
fs.writeFileSync(p, s);
console.log('patched deploy-v10.js: deepest-sufficient-UTXO funding (removes ghost-skip + adds MIN_FUND floor)');
