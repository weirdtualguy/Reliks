import * as fs from 'fs';
import { blake2b } from '@noble/hashes/blake2b';
import { encodePalette, encodeTraitLayer, LayerType } from './encoder';

// The exact program hash committed to the Kaspa DAG
const ONCHAIN_PROGRAM_HASH = 'd07ee8d0bada89e92f161ac13828b6823b6eefe5f8f62ff898bd9e0b5540f356'; 
const programHex = fs.readFileSync('sell-program.hex', 'utf-8').trim();

// 1. Verify this is the exact program revealed on-chain
const hash = Buffer.from(blake2b(Buffer.from(programHex, 'hex'), { dkLen: 32 })).toString('hex');
console.log(hash === ONCHAIN_PROGRAM_HASH ? '✅ Verified: This is the exact program revealed on-chain!' : `❌ Hash mismatch: ${hash}`);

// 2. Reconstruct the 568-byte art payload (deterministic)
const palette = encodePalette(
    Array.from({ length: 16 }, (_, i) => (i === 1 ? { r: 220, g: 40, b: 40 } : { r: 0, g: 0, b: 0 }))
);
const bg   = encodeTraitLayer(LayerType.Background, 0, new Array(256).fill(1)).substring(4);
const skin = encodeTraitLayer(LayerType.BodySkin,   1, new Array(256).fill(0)).substring(4);
const eyes = encodeTraitLayer(LayerType.Eyes,       2, new Array(256).fill(0)).substring(4);
const hair = encodeTraitLayer(LayerType.Hair,       3, new Array(256).fill(0)).substring(4);
const artHex = palette + bg + skin + eyes + hair;

// 3. Verify the art is physically embedded in the on-chain program
const artIndex = programHex.indexOf(artHex);
console.log(artIndex >= 0 ? `✅ Art payload found embedded at byte ${artIndex / 2} of the on-chain script.` : '❌ Art not found in program.');

// 4. Decode the 568 bytes into a 16x16 pixel grid
const bytes = Buffer.from(artHex, 'hex');
const colors: number[][] = [];
for (let i = 0; i < 16; i++) {
    colors.push([bytes[i * 3], bytes[i * 3 + 1], bytes[i * 3 + 2]]);
}

const grid: number[][] = Array.from({ length: 16 }, () => new Array(16).fill(0));
let off = 48;
for (let l = 0; l < 4; l++) {
    const packed = bytes.subarray(off, off + 128); 
    off += 128;
    for (let p = 0; p < 256; p++) {
        const idx = (packed[p >> 1] >> (p % 2 === 0 ? 4 : 0)) & 0x0f;
        if (idx !== 0 || l === 0) grid[p >> 4][p & 15] = idx;
    }
}

// 5. Render to Terminal (ANSI TrueColor)
console.log('\n🎨 Terminal Render (16x16):');
for (let y = 0; y < 16; y++) {
    let line = '';
    for (let x = 0; x < 16; x++) {
        const [r, g, b] = colors[grid[y][x]];
        line += `\x1b[48;2;${r};${g};${b}m  `; // Two spaces per pixel for square aspect ratio
    }
    console.log(line + '\x1b[0m');
}

// 6. Export to SVG
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" shape-rendering="crispEdges" style="background:#000">`;
for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
        const [r, g, b] = colors[grid[y][x]];
        svg += `<rect x="${x * 32}" y="${y * 32}" width="32" height="32" fill="rgb(${r},${g},${b})"/>`;
    }
}
svg += `</svg>`;
fs.writeFileSync('genesis-nft-onchain.svg', svg);
console.log('\n✅ Saved high-res SVG to genesis-nft-onchain.svg');
