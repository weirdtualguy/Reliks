'use strict';
const fs = require('fs'), path = require('path');
const CH = require('../web/reliks-chain.js');
CH.init(require('../reliks-templates.js')({ editionAbi: 'edition-abi-v13.json' }));
const V = JSON.parse(fs.readFileSync(path.join(__dirname, 'protocol-vectors.json'), 'utf8'));
let bad = 0;
const t = (n, ok, d) => { if (!ok) bad = 1; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' | ' + d)); };
const info = (n, ok, why) => console.log((ok ? 'PASS ' : 'INFO ') + n + (ok ? '' : ' differs (' + why + ')'));
const hex = (u) => Buffer.from(u).toString('hex');
V.serial.forEach((c) => t('serial ' + c.label, CH.serialFromOutpoint(c.txid, c.index) === c.serial, CH.serialFromOutpoint(c.txid, c.index) + ' vs ' + c.serial));
V.lineage.forEach((c, k) => {
  let cur = CH.genesisLineage(c.txid, c.index); t('genesis lineage ' + k, cur === c.genesis, cur);
  c.owners.forEach((o, i) => { cur = CH.advanceLineage(cur, o); t('lineage chain ' + k + ' step ' + i, cur === c.chain[i], cur); });
});
V.covenant_id.forEach((c, i) => { const g = CH.covenantIdGenesis(c.txid, c.index, c.outs); t('covenant id ' + i + ' (' + c.outs.length + ' outs)', g === c.id, g); });
V.edition_state.forEach((c, i) => { const h = hex(CH.encEditionState(c.state)); t('edition state ' + i + ' (203 B)', h === c.hex && h.length === 406, h.length / 2 + ' B'); });
V.factory_state.forEach((c, i) => { const h = hex(CH.encFactoryState(c.state)); t('factory state ' + i + ' (135 B)', h === c.hex && h.length === 270, h.length / 2 + ' B'); });
V.rejects.forEach((c, i) => { let threw = false; try { c.kind === 'edition' ? CH.encEditionState(c.state) : CH.encFactoryState(c.state); } catch (e) { threw = true; } t('invalid ' + c.kind + ' state rejected ' + i, threw, 'accepted'); });
for (const lp of ['v13/ledger-vm-v13.json', 'v13/ledger-marks3-v13.json']) {
  if (!fs.existsSync(lp)) continue;
  const L = JSON.parse(fs.readFileSync(lp, 'utf8')), nm = lp.split('/').pop().replace('.json', '');
  L.editions.forEach((e, i) => {
    const prev = i === 0 ? L.genesisTxId : L.editions[i - 1].mintTxId;   // lane outpoint spent by this mint: output 0 of the previous mint tx (genesis tx for the first)
    t(nm + ' edition ' + i + ': serial == serialFromOutpoint(lane outpoint its mint spent)', CH.serialFromOutpoint(prev, 0) === String(e.serial), CH.serialFromOutpoint(prev, 0) + ' vs ' + e.serial);
    if (Number(e.sales) === 0) t(nm + ' edition ' + i + ': lineage == genesis lineage of that lane outpoint', CH.genesisLineage(prev, 0) === e.lineage, 'differs');
  });
}
console.log(bad ? 'PROTOCOL VECTORS FAILED' : 'PROTOCOL VECTORS OK'); process.exit(bad);
