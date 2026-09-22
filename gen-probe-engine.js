const fs = require('fs');
const S = parseInt(process.argv[2] || '16384', 10);
const V = require('./reliks-engine-v10.js');
const { blake2b } = require('@noble/hashes/blake2b');
const B = Buffer;
const tag = '\n/*PROBE-PAD:';
const end = '*/';
const pad = S - B.byteLength(V.ENGINE_SRC) - B.byteLength(tag) - B.byteLength(end);
if (pad < 0) { console.error('target size too small for base engine'); process.exit(1); }
const ENGINE_SRC = V.ENGINE_SRC + tag + 'x'.repeat(pad) + end;
if (B.byteLength(ENGINE_SRC) !== S) { console.error('size mismatch'); process.exit(1); }
const engineHashHex = B.from(blake2b(B.from(ENGINE_SRC, 'utf8'), { dkLen: 32 })).toString('hex');
const out = 'reliks-engine-probe-' + S + '.js';
fs.writeFileSync(out,
  'const V=require("./reliks-engine-v10.js");const {blake2b}=require("@noble/hashes/blake2b");const B=Buffer;\n' +
  'const ENGINE_SRC=' + JSON.stringify(ENGINE_SRC) + ';\n' +
  'const engineHashHex=B.from(blake2b(B.from(ENGINE_SRC,"utf8"),{dkLen:32})).toString("hex");\n' +
  'module.exports={...V,ENGINE_SRC,engineHashHex};\n');
console.log('wrote', out, '| bytes', B.byteLength(ENGINE_SRC), '| engine_hash', engineHashHex, '| render_hash', V.renderHashHex);
