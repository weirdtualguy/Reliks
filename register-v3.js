const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const fac = JSON.parse(fs.readFileSync('factory-ledger-v3.json', 'utf8'));
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const ph = Buffer.from(blake2b(fs.readFileSync('art-program.bin'), { dkLen: 32 })).toString('hex');
const covId = fac.editions[fac.editions.length - 1];
const led = JSON.parse(fs.readFileSync('editions-ledger.json', 'utf8'));
if (led.some(e => e.covenantId === covId)) { console.log('already registered'); process.exit(0); }
led.push({ covenantId: covId, ownerIdentifier: USER, identifierType: 0, price: 0,
  artist: USER, royalty_bips: 500, program_hash: ph, serial: fac.editions.length - 1, factory_covid: fac.covenantId });
fs.writeFileSync('editions-ledger.json', JSON.stringify(led, null, 2));
console.log('✅ registered v2 edition', covId);
