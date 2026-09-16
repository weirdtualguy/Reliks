import * as fs from 'fs';
import { compileSeries } from './bridge3';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
(async () => {
  const js = fs.readFileSync('examples/bloom4.js', 'utf8');
  if (Buffer.byteLength(js) > 2045) { console.log('❌ JS source > 2045 bytes for byte[568] slot — minify or await Series v4'); process.exit(1); }
  const slot = Buffer.alloc(2048); slot[0] = 0x4a; slot.writeUInt16BE(Buffer.byteLength(js), 1); slot.write(js, 3, 'utf8');
  const f = compileSeries({ slot: slot.toString('hex'), artist: USER, price: 100000000, cap: 64, role: 0, counter: 0, owner: USER });
  fs.writeFileSync('factory4-program.hex', f.bytecodeHex);
  let d: any = null;
  for (let i = 0; i < 4 && !d; i++) {
    try { const r = await fetch('https://kascov.io/data/testnet-10/deploy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ program_hex: f.bytecodeHex, value: 1000000000 }) });
      const j = await r.json(); if (j.covenant_id) d = j; } catch (e) { console.log('retry', i + 1); await new Promise(r => setTimeout(r, 3000)); } }
  if (!d) { console.log('❌ deploy failed'); process.exit(1); }
  console.log('🏭 JS factory covenant:', d.covenant_id);
  fs.writeFileSync('factory4-pending.json', JSON.stringify({ covenantId: d.covenant_id, genesis: '', counter: 0, slotHex: slot.toString('hex') }, null, 1));
  let genesis = '';
  for (let i = 0; i < 15 && !genesis; i++) {
    try { const t = await (await fetch(`https://kascov.io/data/testnet-10/c/${d.covenant_id}.json`)).text();
      if (t.startsWith('{')) genesis = JSON.parse(t).events[0].txid; } catch (e) {}
    if (!genesis) await new Promise(r => setTimeout(r, 4000)); }
  if (!genesis) { console.log('❌ genesis not indexed — aborting (no monuments!)'); process.exit(1); }
  fs.writeFileSync('factory4.json', JSON.stringify({ covenantId: d.covenant_id, genesis, counter: 0, slotHex: slot.toString('hex') }, null, 1));
  console.log('🏭 JS factory:', d.covenant_id, '| genesis', genesis, '|', Buffer.byteLength(js), 'B of JavaScript on-chain');
})();
