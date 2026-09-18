const fs = require('fs');
const z32 = () => new Array(32).fill(0);
const args = [
  { kind: 'bytes', value: z32() },   // init_owner        byte[32]
  { kind: 'byte',  value: 0 },       // init_scheme       byte
  { kind: 'int',   value: 0 },       // init_price        int
  { kind: 'bytes', value: z32() },   // init_artist       byte[32]
  { kind: 'int',   value: 500 },     // init_royalty_bips int
  { kind: 'bytes', value: z32() },   // init_program_hash byte[32]
  { kind: 'bytes', value: z32() },   // init_factory_covid byte[32]
  { kind: 'int',   value: 0 }        // init_serial       int
];
fs.writeFileSync('edition-args-v2.json', JSON.stringify(args));
console.log('✅ edition-args-v2.json (8 placeholder args)');
