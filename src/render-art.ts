import * as fs from 'fs';
import { blake2b } from '@noble/hashes/blake2b';
import { encodePalette, encodeTraitLayer, LayerType } from './encoder';

const ONCHAIN_PROGRAM_HASH = 'e621e41064ab5bb2c328a009e0dd0d128e010d98493ba0cf645908c6023ee445';
const programHex = fs.readFileSync('program.hex', 'utf8').trim();

// 1) program == on-chain P2SH commitment?
const hash = Buffer.from(blake2b(Buffer.from(programHex, 'hex'), { dkLen: 32 })).toString('hex');
console.log(hash === ONCHAIN_PROGRAM_HASH ? '✅ program hash MATCHES on-chain commitment' : `❌ mismatch: ${hash}`);

// 2) deterministic art payload, located inside the committed program
const palette = encodePalette(Array.from({ length: 16 }, (_, i) => (i === 1 ? { r: 220, g: 40, b: 40 } : { r: 0, g: 0, b: 0 })));
const bg   = encodeTraitLayer(LayerType.Background, 0, new Array(256).fill(1)).substring(4);
const skin = encodeTraitLayer(LayerType.BodySkin,   1, new Array(256).fill(0)).substring(4);
const eyes = encodeTraitLayer(LayerType.Eyes,       2, new Array(256).fill(0)).substring(4);
const hair = encodeTraitLayer(LayerType.Hair,       3, new Array(256).fill(0)).substring(4);
const art = palette + bg + skin + eyes + hair;
const at = programHex.indexOf(art);
console.log(at >= 0 ? `✅ art embedded at byte ${at / 2} of the committed program` : '❌ art not found in program');

// 3) decode: 48-byte palette + 4 layers x 128 packed nibbles
const bytes = Buffer.from(art, 'hex');
const colors: number[][] = [];
for (let i = 0; i < 16; i++) colors.push([bytes[i * 3], bytes[i * 3 + 1], bytes[i * 3 + 2]]);
const grid: number[][] = Array.from({ length: 16 }, () => new Array(16).fill(0));
let off = 48;
for (let l = 0; l < 4; l++) {
    const packed = bytes.subarray(off, off + 128); off += 128;
    for (let p = 0; p < 256; p++) {
        const idx = (packed[p >> 1] >> (p % 2 === 0 ? 4 : 0)) & 0x0f;
        if (idx !== 0 || l === 0) grid[p >> 4][p & 15] = idx;
    }
}

// 4) ANSI truecolor render in Termux
for (let y = 0; y < 16; y++) {
    let line = '';
    for (let x = 0; x < 16; x++) {
        const [r, g, b] = colors[grid[y][x]];
        line += `\x1b[48;2;${r};${g};${b}m  `;
    }
    console.log(line + '\x1b[0m');
}

// 5) SVG for the browser
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" shape-rendering="crispEdges">`;
for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const [r, g, b] = colors[grid[y][x]];
    svg += `<rect x="${x * 32}" y="${y * 32}" width="32" height="32" fill="rgb(${r},${g},${b})"/>`;
}
fs.writeFileSync('genesis-nft.svg', svg + `</svg>`);
console.log('✅ wrote genesis-nft.svg — open it in your browser');
