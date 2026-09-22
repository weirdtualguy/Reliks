const fs = require('fs');
const html = fs.readFileSync('reliks-studio.html', 'utf8');
const mp = html.match(/var PRELUDE=(.*);\n/);
const mt = html.match(/var TEMPLATES=(.*);\n/);
if (!mp || !mt) { console.error('parse fail: PRELUDE/TEMPLATES not found in reliks-studio.html'); process.exit(1); }
const PRELUDE = JSON.parse(mp[1]);
const TEMPLATES = JSON.parse(mt[1]);
const src = PRELUDE + '\n' + TEMPLATES.circles;
const lines = [
  "const { blake2b } = require('@noble/hashes/blake2b');",
  "const B = Buffer;",
  "const ENGINE_SRC = " + JSON.stringify(src) + ";",
  "const TEST_SERIAL = 1;",
  "function seedLanes(serial){const le=B.alloc(8);le.writeBigUInt64LE(BigInt(serial));const h=blake2b(B.concat([B.from('ReliksSeedV10','utf8'),le]),{dkLen:32});const dv=new DataView(h.buffer,h.byteOffset,h.byteLength);const lanes=[];for(let i=0;i<8;i++)lanes.push(dv.getInt32(i*4,true));return lanes;}",
  "const compiled=new Function('L','serial',ENGINE_SRC+'\\nreturn reliks(L,serial);');",
  "function render(serial){const s=Number(BigInt(serial)&0xFFFFFFFFn);return compiled(seedLanes(s),s|0);}",
  "const engineHashHex=B.from(blake2b(B.from(ENGINE_SRC,'utf8'),{dkLen:32})).toString('hex');",
  "const renderHashHex=B.from(blake2b(B.from(render(TEST_SERIAL),'utf8'),{dkLen:32})).toString('hex');",
  "module.exports={ENGINE_SRC,seedLanes,render,engineHashHex,renderHashHex,TEST_SERIAL};"
];
fs.writeFileSync('my-engine.js', lines.join('\n') + '\n');
console.log('my-engine.js mirrored from shipped HTML bytes | prelude', PRELUDE.length, 'B | ENGINE_SRC', src.length, 'B');
