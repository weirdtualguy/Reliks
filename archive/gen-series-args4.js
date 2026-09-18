const fs = require('fs');

const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const userBytes = Array.from(Buffer.from(USER, 'hex'));

// byte[2048] art slot — zeros are fine for tag verification
const artBytes = new Array(2048).fill(0);

// Exact order from the live Series.sil:
// 1. byte[2048] program_art
// 2. byte[32]   artist_id
// 3. int        mint_price_sompi
// 4. int        royalty_bips_val  <-- THE MISSING ONE
// 5. int        edition_cap
// 6. byte       init_role
// 7. int        init_counter
// 8. byte[32]   init_owner

const args = [
  { kind: 'bytes', value: artBytes },        // 1. program_art
  { kind: 'bytes', value: userBytes },       // 2. artist_id
  { kind: 'int',   value: 100000000 },       // 3. mint_price_sompi
  { kind: 'int',   value: 500 },             // 4. royalty_bips_val (5% = 500 bips)
  { kind: 'int',   value: 64 },              // 5. edition_cap
  { kind: 'byte',  value: 0 },               // 6. init_role (ROLE_SERIES)
  { kind: 'int',   value: 0 },               // 7. init_counter
  { kind: 'bytes', value: userBytes },       // 8. init_owner
];

fs.writeFileSync('series-args4.json', JSON.stringify(args));
console.log('✅ series-args4.json written (8 args, ' + artBytes.length + '-byte art slot)');
