import * as fs from 'fs';
import { blake2b } from '@noble/hashes/blake2b';
import { compile2, execute2, toSVG } from './gen2';
const bc = compile2(fs.readFileSync('examples/bloom2.pco', 'utf8'));
console.log(`✅ bloom2.pco → ${bc.length} B of pcove-v2 bytecode (vector, resolution-free)`);
const F = JSON.parse(fs.readFileSync('factory.json', 'utf8'));
const seed = Buffer.from(blake2b(Buffer.concat([Buffer.from(F.genesis, 'hex'), Buffer.from([0])]), { dkLen: 32 }));
for (const fr of [0, 1, 2]) {
  const a = execute2(bc, seed, fr), b = execute2(bc, seed, fr);
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('NON-DETERMINISTIC');
  fs.writeFileSync(`bloom2-f${fr}.svg`, toSVG(a, 720));
  console.log(`🌸 frame ${fr}: ${a.prims.length} vector prims, ${a.ops} ops → bloom2-f${fr}.svg`);
}
console.log('open bloom2-f0.svg and pinch-zoom: crisp at ANY size — the 16×16 cage is gone');
