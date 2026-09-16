import * as fs from 'fs';
const prog = Buffer.from(fs.readFileSync('series-factory.hex', 'utf8').trim(), 'hex');
const N: Record<number, string> = {
  0x63: 'OP_IF', 0x67: 'OP_ELSE', 0x68: 'OP_ENDIF', 0x69: 'OP_VERIFY', 0x6b: 'OP_TOALT', 0x6c: 'OP_FROMALT',
  0x6d: 'OP_2DROP', 0x6e: 'OP_2DUP', 0x73: 'OP_DEPTH', 0x74: 'OP_DROP', 0x75: 'OP_DROP', 0x76: 'OP_DUP',
  0x77: 'OP_NIP', 0x78: 'OP_OVER', 0x79: 'OP_PICK', 0x7a: 'OP_ROLL', 0x7b: 'OP_ROT', 0x7c: 'OP_SWAP', 0x7d: 'OP_TUCK',
  0x87: 'OP_EQUAL', 0x88: 'OP_EQUALVERIFY', 0x9d: 'OP_NUMEQUALVERIFY', 0xac: 'OP_CHECKSIG',
};
// locate the mint tag push (PUSH4 42c6a550)
let start = -1;
for (let i = 0; i + 5 <= prog.length; i++) if (prog[i] === 0x04 && prog.subarray(i + 1, i + 5).toString('hex') === '42c6a550') { start = i; break; }
if (start < 0) { console.log('mint tag not found'); process.exit(1); }
console.log(`mint dispatch compare at offset ${start}; decoding wrapper from OP_IF:`);
let i = start + 5, n = 0;
const lim = Number(process.argv[2] || 160);
while (i < prog.length && n < lim) {
  const op = prog[i];
  if (op >= 0x01 && op <= 0x4b) { console.log(`${String(i).padStart(4)}  PUSH${String(op).padStart(3)}  ${prog.subarray(i + 1, i + 1 + op).toString('hex')}`); i += 1 + op; }
  else if (op >= 0x4c && op <= 0x4e) { const wl = op - 0x4b; const len = wl === 1 ? prog[i + 1] : prog.readUInt16LE(i + 1);
    console.log(`${String(i).padStart(4)}  PUSHDATA${wl} len=${len} ${prog.subarray(i + 1 + wl, i + 1 + wl + Math.min(len, 20)).toString('hex')}${len > 20 ? '…' : ''}`); i += 1 + wl + len; }
  else if (op >= 0x51 && op <= 0x60) { console.log(`${String(i).padStart(4)}  OP_${op - 0x50}`); i++; }
  else if (op >= 0xb0) { console.log(`${String(i).padStart(4)}  KASPA_OP_${op.toString(16)}`); i++; }
  else { console.log(`${String(i).padStart(4)}  ${N[op] || 'OP_' + op.toString(16)}`); i++; }
  n++;
}
