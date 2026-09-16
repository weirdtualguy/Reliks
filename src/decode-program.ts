import * as fs from 'fs';
const prog = Buffer.from(JSON.parse(fs.readFileSync('m2-state.json', 'utf8')).programHex, 'hex');
const N: Record<number, string> = {
  0x4f: 'OP_1NEG', 0x61: 'OP_NOP', 0x63: 'OP_IF', 0x64: 'OP_NOTIF', 0x67: 'OP_ELSE', 0x68: 'OP_ENDIF',
  0x69: 'OP_VERIFY', 0x6a: 'OP_RETURN', 0x6b: 'OP_TOALT', 0x6c: 'OP_FROMALT', 0x6d: 'OP_2DROP', 0x6e: 'OP_2DUP',
  0x70: 'OP_3DROP', 0x73: 'OP_DEPTH', 0x74: 'OP_DROP', 0x75: 'OP_DROP', 0x76: 'OP_DUP', 0x77: 'OP_NIP',
  0x78: 'OP_OVER', 0x79: 'OP_PICK', 0x7a: 'OP_ROLL', 0x7b: 'OP_ROT', 0x7c: 'OP_SWAP', 0x7d: 'OP_TUCK',
  0x82: 'OP_ADD', 0x87: 'OP_EQUAL', 0x88: 'OP_EQUALVERIFY', 0x93: 'OP_ADD', 0x94: 'OP_SUB',
  0x9c: 'OP_NUMEQUAL', 0x9d: 'OP_NUMEQUALVERIFY', 0xa0: 'OP_NUM2BOOL', 0xa2: 'OP_BOOLOR', 0xa9: 'OP_HASH',
  0xaa: 'OP_BLAKE2B', 0xab: 'OP_CHECKSIG_ECDSA', 0xac: 'OP_CHECKSIG', 0xad: 'OP_CHECKMULTISIG',
};
let i = 0, n = 0;
const lim = Number(process.argv[2] || 70);
while (i < prog.length && n < lim) {
  const op = prog[i];
  if (op >= 0x01 && op <= 0x4b) {
    const d = prog.subarray(i + 1, i + 1 + op);
    console.log(`${String(i).padStart(4)}  PUSH${String(op).padStart(3)}  ${d.toString('hex')}`);
    i += 1 + op;
  } else if (op === 0x4c || op === 0x4d || op === 0x4e) {
    const wl = op - 0x4b; const len = wl === 1 ? prog[i + 1] : prog.readUInt16LE(i + 1);
    console.log(`${String(i).padStart(4)}  PUSHDATA${wl}  len=${len}  ${prog.subarray(i + 1 + wl, i + 1 + wl + Math.min(len, 24)).toString('hex')}${len > 24 ? '…' : ''}`);
    i += 1 + wl + len;
  } else if (op >= 0x51 && op <= 0x60) { console.log(`${String(i).padStart(4)}  OP_${op - 0x50}`); i++; }
  else if (op >= 0xb0) { console.log(`${String(i).padStart(4)}  KASPA_OP_${op.toString(16)}`); i++; }
  else { console.log(`${String(i).padStart(4)}  ${N[op] || 'OP_' + op.toString(16)}`); i++; }
  n++;
}
