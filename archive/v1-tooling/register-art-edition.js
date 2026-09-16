const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const fac = JSON.parse(fs.readFileSync('factory-ledger-art.json', 'utf8'));
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const artBytes = fs.readFileSync('art-program.bin');
const ph = Buffer.from(blake2b(artBytes, { dkLen: 32 })).toString('hex');
const covId = fac.editions[fac.editions.length - 1];
const led = JSON.parse(fs.readFileSync('editions-ledger.json', 'utf8'));
const exists = led.some(e => e.covenantId === covId);
if (exists === false) {
  led.push({
    covenantId: covId, ownerIdentifier: USER, identifierType: 0, price: 0,
    artist: USER, royalty_bips: 500, program_hash: ph,
    serial: fac.editions.length - 1, factory_covid: fac.covenantId
  });
  fs.writeFileSync('editions-ledger.json', JSON.stringify(led, null, 2));
  console.log('✅ registered real-art edition', covId);
} else {
  console.log('Edition already registered');
}
