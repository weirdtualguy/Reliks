const fs = require('fs');

// 1. Ledger: inject immutable mint pointers for series-B edition #0
const LP = process.env.RELIKS_LEDGER || 'data/factory-ledger-v11.json';
const LD = JSON.parse(fs.readFileSync(LP, 'utf8'));
let ledgerDirty = false;
for (let i = 0; i < LD.editions.length; i++) {
  const ed = LD.editions[i];
  if (!ed.mintTxId) {
    // From the rehearsal logs: series-B edition #0 mint txid
    if (i === 0 && ed.cov.startsWith('1b26f636')) {
      ed.mintTxId = '0b977f677b5c7749e8f90955832f4e4e50625f775b0d5cbfbc93885a5ba853f3';
      ed.mintIndex = 1;
      ledgerDirty = true;
    } else {
      console.error('Unknown mint tx for edition', i, '- manual injection required'); process.exit(1);
    }
  }
}
if (ledgerDirty) {
  fs.writeFileSync(LP, JSON.stringify(LD, null, 2));
  console.log('ledger: mintTxId/mintIndex injected for editions[0]');
}

// 2. Verifier: lineage + F1 gate switched to mintTxId
const VP = 'verify-render-v10.js';
let v = fs.readFileSync(VP, 'utf8');
v = v.split("const mintTx = await (await fetch(V.rest + '/transactions/' + ed.txId)).json();")
     .join("const mintTx = await (await fetch(V.rest + '/transactions/' + ed.mintTxId)).json();");
v = v.split("const consumedLaneTxId = i === 0 ? LD.genesisTxId : editions[i - 1].txId;")
     .join("const consumedLaneTxId = i === 0 ? LD.genesisTxId : editions[i - 1].mintTxId;");
fs.writeFileSync(VP, v);
console.log('verify-render-v10.js: lineage/F1 switched to mintTxId');

// 3. Gallery generator: lineage switched to mintTxId (live UTXO checks keep txId)
const GP = 'gen-gallery-v10.js';
let g = fs.readFileSync(GP, 'utf8');
g = g.split("assert(RG.serialOfV10(LD.editions[i - 1].txId, 0) === String(LD.editions[i].serial), 'serial #' + i);")
     .join("assert(RG.serialOfV10(LD.editions[i - 1].mintTxId, 0) === String(LD.editions[i].serial), 'serial #' + i);");
g = g.split("var consumed = i === 0 ? REG.genesisTxId : eds[i - 1].txId;")
     .join("var consumed = i === 0 ? REG.genesisTxId : eds[i - 1].mintTxId;");
g = g.split("var mintTx = await fetchTx(ed.txId);")
     .join("var mintTx = await fetchTx(ed.mintTxId);");
fs.writeFileSync(GP, g);
console.log('gen-gallery-v10.js: lineage switched to mintTxId');
