import * as fs from 'fs';
import { compile } from './gencompiler';
import { execute } from './genvm';
const src = fs.readFileSync('examples/bloom.pco', 'utf8');
const bc = compile(src);
console.log(`✅ compiled bloom.pco → ${bc.length} bytes of pcove bytecode (vs 568B static art)`);
console.log('   hex:', bc.toString('hex'));
const seeds = ['0e1166a4c525d680', '3b683545ccb22702', '920b7e4a09bd1e8d'].map(h => Buffer.from(h, 'hex'));
seeds.forEach((sd, i) => {
  const a = execute(bc, sd), b = execute(bc, sd);
  if (JSON.stringify(a.grid) !== JSON.stringify(b.grid)) throw new Error('NON-DETERMINISTIC!');
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" shape-rendering="crispEdges">`;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const [r, g, bl] = a.palette[a.grid[y * 16 + x]] || [0, 0, 0];
    svg += `<rect x="${x * 32}" y="${y * 32}" width="32" height="32" fill="rgb(${r},${g},${bl})"/>`; }
  fs.writeFileSync(`bloom-${i + 1}.svg`, svg + `</svg>`);
  console.log(`🌸 seed ${sd.toString('hex').slice(0, 8)}… → ${a.ops} ops → bloom-${i + 1}.svg`);
});
console.log('✅ determinism verified: same seed ⇒ identical pixels');
