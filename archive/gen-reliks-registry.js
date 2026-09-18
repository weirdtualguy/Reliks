const fs = require('fs');
let files = process.argv.slice(2);
if (!files.length) files = ['factory-ledger-v5.json'];
const reg = {};
for (const f of files) {
  const l = JSON.parse(fs.readFileSync(f, 'utf8'));
  const id = l.covenantId || l.C;
  const ids = l.revealTxIds || (l.revealTxId ? [l.revealTxId] : null);
  if (!id || !ids) { console.log('skip ' + f + ' (missing covenantId or reveal txs)'); continue; }
  const mintTx = l.lanes && l.lanes.length ? l.lanes[l.lanes.length - 1].txId : l.txId;
  reg[id] = { revealTxIds: ids, revealTxId: ids[0], genesisTxId: l.genesisTxId || l.txId, mintTx };
}
fs.writeFileSync('web/reliks-registry.json', JSON.stringify(reg, null, 2));
console.log('wrote web/reliks-registry.json with ' + Object.keys(reg).length + ' series: ' + Object.keys(reg).join(', '));
