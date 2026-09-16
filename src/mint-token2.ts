import * as fs from 'fs';
import { blake2b } from '@noble/hashes/blake2b';
import { compileNftInstance } from './compiler-bridge';
import { encodePalette, encodeTraitLayer, LayerType } from './encoder';

const P = (rows: string[]) => rows.join('').split('').map(c => parseInt(c, 10));
const Z = '0000000000000000';

const BG = Array(16).fill(Z);
const SKIN = [Z,'0001110000111000','0001110000111000','0001110000111000','0000111111110000',
 '0001111111111000','0011111111111100','0011111111111100','0011111111111100','0011111111111100',
 '0011111111111100','0001111111111000','0001111111111000','0000111111110000',Z,Z];
const EYES = [Z,Z,Z,Z,Z,Z,Z,'0002220002220000','0002120002120000','0002220002220000',
 '0000000440000000','0000000440000000','0000000220000000',Z,Z,Z];
const HAIR = [Z,'0002220000222000','0002220000222000','0000000220000000',Z,Z,Z,Z,Z,Z,
 '0003000000003000',Z,Z,Z,Z,Z];

const palette = encodePalette([
  { r: 11, g: 11, b: 15 }, { r: 245, g: 245, b: 245 }, { r: 21, g: 21, b: 21 },
  { r: 220, g: 40, b: 40 }, { r: 255, g: 143, b: 163 },
  ...Array(11).fill({ r: 0, g: 0, b: 0 })
]);
const art = palette + [
  encodeTraitLayer(LayerType.Background, 0, P(BG)).substring(4),
  encodeTraitLayer(LayerType.BodySkin,   1, P(SKIN)).substring(4),
  encodeTraitLayer(LayerType.Eyes,       2, P(EYES)).substring(4),
  encodeTraitLayer(LayerType.Hair,       3, P(HAIR)).substring(4),
].join('');
if (art.length !== 568 * 2) throw new Error(`payload ${art.length / 2}B != 568B`);

const COLLECTION_ID = Buffer.from(blake2b(Buffer.from('pixel-cove-genesis-collection', 'utf8'), { dkLen: 32 })).toString('hex');
const { bytecodeHex, scriptPublicKey } = compileNftInstance({
  collectionId: '0x' + COLLECTION_ID, tokenId: 2, artPayload: '0x' + art,
  initOwner: '0x33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68', initScheme: 0,
});
fs.writeFileSync('token2-program.hex', bytecodeHex);
console.log(`✅ program ${bytecodeHex.length / 2}B | P2SH ${scriptPublicKey}`);
console.log(bytecodeHex.indexOf(art) >= 0 ? '✅ face embedded in program' : '❌ art missing');

// render from authored matrices (clean, no decode stride issues)
const layers = [P(BG), P(SKIN), P(EYES), P(HAIR)];
const cols = [[11,11,15],[245,245,245],[21,21,21],[220,40,40],[255,143,163]];
const grid = Array.from({ length: 256 }, (_, p) => {
  let v = layers[0][p];
  for (let l = 1; l < 4; l++) if (layers[l][p] !== 0) v = layers[l][p];
  return v;
});
console.log('\n🐼 Token #2 terminal render:');
for (let y = 0; y < 16; y++) {
  let line = '';
  for (let x = 0; x < 16; x++) { const [r, g, b] = cols[grid[y * 16 + x]]; line += `\x1b[48;2;${r};${g};${b}m  `; }
  console.log(line + '\x1b[0m');
}
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" shape-rendering="crispEdges">`;
for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
  const [r, g, b] = cols[grid[y * 16 + x]];
  svg += `<rect x="${x * 32}" y="${y * 32}" width="32" height="32" fill="rgb(${r},${g},${b})"/>`;
}
fs.writeFileSync('token2-nft.svg', svg + `</svg>`);
console.log('✅ token2-nft.svg saved');

(async () => {
  const res = await fetch('https://kascov.io/data/testnet-10/deploy', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ program_hex: bytecodeHex, value: 1000000000 })
  });
  const j: any = await res.json();
  console.log('🚀 deploy:', JSON.stringify(j));
  if (j.covenant_id) console.log(`🔗 https://kascov.io/#/testnet-10/c/${j.covenant_id}`);
})();
