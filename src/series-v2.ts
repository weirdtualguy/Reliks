import * as fs from 'fs';
import { compile2 } from './gen2';
import { compileSeries } from './bridge3';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
(async () => {
  const bc = compile2(fs.readFileSync('examples/bloom2.pco', 'utf8'));
  const slot = Buffer.alloc(568); slot[0] = 0xff; slot.writeUInt16BE(bc.length, 1); bc.copy(slot, 3);
  const slotHex = slot.toString('hex');
  const f = compileSeries({ slot: slotHex, artist: USER, price: 100000000, cap: 64, role: 0, counter: 0, owner: USER });
  let d: any = null;
  for (let i = 0; i < 4 && !d; i++) {
    try { const r = await fetch('https://kascov.io/data/testnet-10/deploy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ program_hex: f.bytecodeHex, value: 1000000000 }) });
      const j = await r.json(); if (j.covenant_id) d = j; } catch (e) { console.log('retry', i + 1); await new Promise(r => setTimeout(r, 3000)); } }
  if (!d) { console.log('❌ deploy failed'); process.exit(1); }
  console.log('🏭 v2 factory covenant:', d.covenant_id);
  let genesis = '';
  for (let i = 0; i < 8 && !genesis; i++) {
    try { const t = await (await fetch(`https://kascov.io/data/testnet-10/c/${d.covenant_id}.json`)).text();
      if (t.startsWith('{')) genesis = JSON.parse(t).events[0].txid; } catch (e) {}
    if (!genesis) await new Promise(r => setTimeout(r, 4000)); }
  if (!genesis) { console.log('❌ genesis not indexed — aborting (no empty-genesis monuments!)'); process.exit(1); }
  fs.writeFileSync('factory2.json', JSON.stringify({ covenantId: d.covenant_id, genesis, counter: 0, slotHex }, null, 1));
  console.log('📜 genesis:', genesis, '| slot marker 0xFF,', bc.length, 'B vector program embedded');
})();
