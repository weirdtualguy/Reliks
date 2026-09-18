const fs = require('fs');
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const slotHex = '4a03d8' + '00'.repeat(2045); // placeholder slot, replace with real one for deploy
const slot = Array.from(Buffer.from(slotHex, 'hex'));
const artist = Array.from(Buffer.from(USER, 'hex'));
const args = [
  {kind:'bytes', value: slot},           // program_art byte[2048]
  {kind:'bytes', value: artist},         // artist_id byte[32]
  {kind:'int',   value: 100000000},      // mint_price_sompi (1 TKAS)
  {kind:'int',   value: 500},            // royalty_bips_val (5% = 500 bips)
  {kind:'int',   value: 64},             // edition_cap
  {kind:'byte',  value: 0},              // init_role (ROLE_SERIES)
  {kind:'int',   value: 0},              // init_counter
  {kind:'bytes', value: artist}          // init_owner byte[32]
];
fs.writeFileSync('series-v5-args.json', JSON.stringify(args));
console.log('✅ series-v5-args.json written (8 args, royalty_bips=500)');
