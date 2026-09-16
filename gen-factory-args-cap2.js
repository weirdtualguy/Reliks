const fs = require('fs');
const abi = JSON.parse(fs.readFileSync('edition-abi-v3.json', 'utf8'));
const contractName = Object.keys(abi.contracts)[0];
const c = abi.contracts[contractName];

const bytecode = Buffer.from(c.compiled.bytecode);
const span = c.compiled.state_span;
const templateHash = Buffer.from(c.compiled.template_hash);

const prefix = Array.from(bytecode.subarray(0, span.offset));
const suffix = Array.from(bytecode.subarray(span.offset + span.len));

const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const artist = Array.from(Buffer.from(USER, 'hex'));

// Load the real art bytes
const artHex = fs.readFileSync('art-program.hex', 'utf8').trim();
const art = Array.from(Buffer.from(artHex, 'hex'));

const args = [
  { kind: 'bytes', value: art },                    // program_art byte[2048]
  { kind: 'bytes', value: artist },                 // artist_id byte[32]
  { kind: 'int',   value: 100000000 },             // mint_price_sompi (1 TKAS)
  { kind: 'int',   value: 500 },                   // royalty_bips_val (5%)
  { kind: 'int',   value: 2 },                    // edition_cap
  { kind: 'int',   value: 0 },                     // init_counter
  { kind: 'bytes', value: prefix },                // edition_template_prefix
  { kind: 'bytes', value: suffix },                // edition_template_suffix
  { kind: 'bytes', value: Array.from(templateHash) } // expected_template_hash
];

fs.writeFileSync('factory-args-cap2.json', JSON.stringify(args));
console.log('✅ factory-args-cap2.json written with real art');
