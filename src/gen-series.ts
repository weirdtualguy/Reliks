import * as fs from 'fs';
import { blake2b } from '@noble/hashes/blake2b';
import { compile } from './gencompiler';
import { execute } from './genvm';
import { compileV2 } from './bridge2';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const CID = Buffer.from(blake2b(Buffer.from('pixel-cove-genesis-collection', 'utf8'), { dkLen: 32 })).toString('hex');
(async () => {
  const bc = compile(fs.readFileSync(process.argv[2] || 'examples/bloom.pco', 'utf8'));
  const slot = Buffer.alloc(568); slot[0] = 0xfe; slot.writeUInt16BE(bc.length, 1); bc.copy(slot, 3);
  const { bytecodeHex } = compileV2({ collectionId: CID, tokenId: 100, artPayload: slot.toString('hex'), initOwner: USER, initScheme: 0, initPrice: 0, initRoyalty: USER });
  fs.writeFileSync('series-program.hex', bytecodeHex);
  const d: any = await (await fetch('https://kascov.io/data/testnet-10/deploy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ program_hex: bytecodeHex, value: 1000000000 }) })).json();
  console.log('🚀 series covenant:', d.covenant_id);
  let genesis = '';
  for (let i = 0; i < 10 && !genesis; i++) { const t = await (await fetch(`https://kascov.io/data/testnet-10/c/${d.covenant_id}.json`)).text();
    if (t.startsWith('{')) genesis = JSON.parse(t).events[0].txid; else await new Promise(r => setTimeout(r, 5000)); }
  console.log('📜 genesis:', genesis);
  const gbytes = Buffer.from(genesis, 'hex');
  const editions = [];
  for (let i = 1; i <= 6; i++) {
    const seed = Buffer.from(blake2b(Buffer.concat([gbytes, Buffer.from([i])]), { dkLen: 32 }));
    const { palette, grid } = execute(bc, seed);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" shape-rendering="crispEdges">`;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const [r, g, b] = palette[grid[y * 16 + x]] || [0, 0, 0];
      svg += `<rect x="${x * 32}" y="${y * 32}" width="32" height="32" fill="rgb(${r},${g},${b})"/>`; }
    fs.writeFileSync(`editions/ed-${i}.svg`, svg + `</svg>`);
    editions.push({ i, seed: seed.toString('hex') });
    console.log(`🌸 edition #${i} seed ${seed.toString('hex').slice(0, 12)}… → editions/ed-${i}.svg`);
  }
  fs.writeFileSync('series.json', JSON.stringify({ covenantId: d.covenant_id, genesis, slotHex: slot.toString('hex'), pcoveHex: bc.toString('hex') }, null, 1));
  fs.writeFileSync('editions.json', JSON.stringify({ series: d.covenant_id, editions }, null, 1));
  console.log('✅ series.json + editions.json written');
})();
