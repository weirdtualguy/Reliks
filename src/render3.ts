import * as fs from 'fs';
import { blake2b } from '@noble/hashes/blake2b';
import { renderJS, toSVG } from './jsrender';
const F = JSON.parse(fs.readFileSync(process.argv[2] || 'factory3.json', 'utf8'));
const NAME = (process.argv[2] || 'factory3.json').replace('factory', 'bloom').replace('.json', '');
const mk = F.slotHex.slice(0, 2), len = parseInt(F.slotHex.slice(2, 6), 16);
if (mk !== '4a') { console.log('❌ not a JS slot'); process.exit(1); }
const js = Buffer.from(F.slotHex.slice(6, 6 + len * 2), 'hex').toString('utf8');
const seed = Buffer.from(blake2b(Buffer.concat([Buffer.from(F.genesis, 'hex'), Buffer.from([0])]), { dkLen: 32 }));
for (const fr of [0, 1]) {
  const a = renderJS(js, seed, fr), b = renderJS(js, seed, fr);
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('NON-DETERMINISTIC');
  fs.writeFileSync(`${NAME}-f${fr}.svg`, toSVG(a as any, 720));
  console.log(`🌸 js frame ${fr}: ${a.prims.length} prims → ${NAME}-f${fr}.svg`);
}
console.log('sandbox: bare V8 realm — no fs/net/Date; Math.random seeded; 5s timeout; 20k prim cap');
