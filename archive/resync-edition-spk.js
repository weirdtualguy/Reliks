const V = require('./v8-lib.js');
const fs = require('fs');
const LD = JSON.parse(fs.readFileSync('factory-ledger-v8.json', 'utf8'));
const Ed = V.parts(JSON.parse(fs.readFileSync('edition-abi-v4.json', 'utf8')));
const stateOf = e => ({ ownerIdentifier: e.owner, identifierType: 0, price: e.price, artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial: e.serial });
let n = 0;
for (const e of LD.editions) {
  if (typeof e !== 'object') continue;
  e.spk = V.hex(V.p2sh(V.B.concat([Ed.prefix, V.encState(Ed, stateOf(e)), Ed.suffix])));
  n++;
}
fs.writeFileSync('factory-ledger-v8.json', JSON.stringify(LD, null, 2));
console.log('resynced spk for', n, 'edition(s) from current ledger state');
