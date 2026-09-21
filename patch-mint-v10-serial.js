const fs = require('fs');
const p = 'mint-v10.js';
let s = fs.readFileSync(p, 'utf8');

const oldSerial = 'const serial = serialOf(lane.txId, lane.index);';
const newSerial = `const serialOfV10 = (txId, idx) => {
    const h = V.blake2b(B.concat([B.from('ReliksSerialV10', 'utf8'), H(txId), V.le32(idx)]), { dkLen: 32 });
    let s = 0n;
    s += BigInt(h[0]);
    s += BigInt(h[1]) * 256n;
    s += BigInt(h[2]) * 65536n;
    s += BigInt(h[3]) * 16777216n;
    s += BigInt(h[4]) * 4294967296n;
    s += BigInt(h[5]) * 1099511627776n;
    s += BigInt(h[6]) * 281474976710656n;
    s += BigInt(h[7] % 128) * 72057594037927936n;
    return s.toString();
  };
  const serial = serialOfV10(lane.txId, lane.index);`;

if (!s.includes(oldSerial)) { console.error('serial anchor not found'); process.exit(1); }
s = s.split(oldSerial).join(newSerial);
fs.writeFileSync(p, s);
console.log('patched mint-v10.js: uses ReliksSerialV10 domain for serial computation');
