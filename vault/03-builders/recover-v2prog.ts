import * as fs from 'fs';
import { compileSeries } from './bridge3';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const F2 = JSON.parse(fs.readFileSync('factory2.json', 'utf8'));
const f = compileSeries({ slot: F2.slotHex, artist: USER, price: 100000000, cap: 64, role: 0, counter: 0, owner: USER });
fs.writeFileSync('factory2-program.hex', f.bytecodeHex);
console.log('✅ factory2-program.hex recovered:', f.bytecodeHex.length / 2, 'B | spk', f.scriptPublicKey);
