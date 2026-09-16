import * as fs from 'fs';
import { compileSeries } from './bridge3';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const S = JSON.parse(fs.readFileSync('series.json', 'utf8'));
const c = compileSeries({ slot: S.slotHex, artist: USER, price: 100000000, cap: 64, role: 0, counter: 0, owner: USER });
console.log(`✅ Series factory program: ${c.bytecodeHex.length / 2} B | P2SH ${c.scriptPublicKey}`);
fs.writeFileSync('series-factory.hex', c.bytecodeHex);
