// Repairs a ledger after a self-sell that was mined but whose confirmation wait timed out. Usage: <ledger> <edIdx> <sellTxId>
const fs = require('fs');
const V = require('../reliks-lib.js');
const { blake2b } = require('@noble/hashes/blake2b');
const B = Buffer, H = V.H, hex = V.hex;
const [,, ledgerPath, idxArg, sellTx] = process.argv;
if (!ledgerPath || !/^[0-9a-f]{64}$/.test(sellTx || '')) { console.error('usage: node tools/repair-self-sell.js <ledger> <edIdx> <sellTxId>'); process.exit(1); }
const LD = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const ed = LD.editions[Number(idxArg)];
if (!ed) { console.error('no such edition'); process.exit(1); }
if (ed.txId === sellTx) { console.log('ledger already points at that tx: nothing to do'); process.exit(0); }
const Ed = V.parts(JSON.parse(fs.readFileSync('v13/out/v13.json', 'utf8')));
const redeemOf = st => B.concat([Ed.prefix, V.encState(Ed, st), Ed.suffix]);
const stateOf = (price, lineage, sales) => ({ ownerIdentifier: ed.owner, identifierType: 0, price, artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial: ed.serial, lineage, sales });
const cur = hex(V.p2sh(redeemOf(stateOf(ed.price, ed.lineage, ed.sales))));
if (ed.spk && cur !== ed.spk) { console.error('ABORT: ledger spk does not match its own state'); process.exit(1); }
const lineage = hex(blake2b(B.concat([B.from('ReliksLineageV2', 'utf8'), H(ed.lineage), H(ed.owner)]), { dkLen: 32 }));
const sales = ed.sales + 1;
fs.copyFileSync(ledgerPath, ledgerPath + '.bak-prerepair');
Object.assign(ed, { txId: sellTx, index: 0, lineage, sales, price: 0, spk: hex(V.p2sh(redeemOf(stateOf(0, lineage, sales)))) });
fs.writeFileSync(ledgerPath, JSON.stringify(LD, null, 2));
console.log('repaired edition ' + idxArg + ' -> sales ' + sales + ' | lineage ' + lineage.slice(0, 16) + ' | txId ' + sellTx.slice(0, 12));
