const fs = require('fs');
const p = 'verify-render-v10.js';
let v = fs.readFileSync(p, 'utf8');

const oldParser = `  const lastPush = (() => { let o = 0, data = Buffer.alloc(0);
    while (o < ss.length) { const op = ss[o++]; let len = 0;
      if (op === 0x00) { data = Buffer.alloc(0); continue; }
      if (op >= 0x01 && op <= 0x4b) len = op;
      else if (op === 0x4c) { len = ss[o]; o += 1; }
      else if (op === 0x4d) { len = ss.readUInt16LE(o); o += 2; }
      else if (op === 0x4e) { len = ss.readUInt32LE(o); o += 4; }
      else throw new Error('non-push opcode in sigscript');
      data = ss.subarray(o, o + len); o += len; }
    return data; })();`;

const newParser = `  const lastPush = (() => { let o = 0, data = Buffer.alloc(0);
    while (o < ss.length) { const op = ss[o++]; let len = 0;
      if (op === 0x00) { data = Buffer.alloc(0); continue; }
      if (op >= 0x01 && op <= 0x4b) len = op;
      else if (op === 0x4c) { len = ss[o]; o += 1; }
      else if (op === 0x4d) { len = ss.readUInt16LE(o); o += 2; }
      else if (op === 0x4e) { len = ss.readUInt32LE(o); o += 4; }
      else if (op === 0x4f) { data = Buffer.from([0x81]); continue; }
      else if (op >= 0x51 && op <= 0x60) { data = Buffer.from([op - 0x50]); continue; }
      else throw new Error('non-push opcode in sigscript: 0x' + op.toString(16));
      data = ss.subarray(o, o + len); o += len; }
    return data; })();`;

if (!v.includes(oldParser)) { console.error('parser anchor not found'); process.exit(1); }
v = v.split(oldParser).join(newParser);
fs.writeFileSync(p, v);
console.log('patched sigscript parser to handle small-int opcodes (OP_1..OP_16, OP_1NEGATE)');
