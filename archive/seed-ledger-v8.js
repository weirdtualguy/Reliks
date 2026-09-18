const V = require('./v8-lib.js');
const fs = require('fs');
(async () => {
  const LD = JSON.parse(fs.readFileSync('factory-ledger-v8.json', 'utf8'));
  if (LD.editions.length && typeof LD.editions[0] === 'object') { console.log('already seeded'); return; }
  const covs = LD.editions.map(e => typeof e === 'string' ? e : e.cov);
  const out = [];
  for (const cov of covs) {
    const c = await (await V.fetchRetry(V.kascov + '/c/' + cov + '.json')).json();
    const live = c.utxos.find(u => u.live);
    const [txId, idxS] = live.outpoint.split(':');
    const index = parseInt(idxS, 10);
    const tx = await (await V.fetchRetry(V.rest + '/transactions/' + txId)).json();
    const po = tx.inputs[0].previous_outpoint || tx.inputs[0].previousOutpoint;
    const laneTx = po.transaction_id || po.transactionId;
    const laneIdx = po.index;
    out.push({ cov, txId, index, amount: live.utxoEntry ? live.utxoEntry.amount : live.amount, owner: V.USER, price: 0, serial: V.serialOf(laneTx, laneIdx) });
  }
  LD.editions = out;
  fs.writeFileSync('factory-ledger-v8.json', JSON.stringify(LD, null, 2));
  console.log('seeded', out.length, 'edition(s):', out.map(e => e.cov.slice(0, 16) + '@' + e.txId.slice(0, 8) + ':' + e.index + ' serial ' + e.serial).join(', '));
})().catch(e => { console.error(e); process.exit(1); });
