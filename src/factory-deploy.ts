import * as fs from 'fs';
const prog = fs.readFileSync('series-factory.hex', 'utf8').trim();
(async () => {
  let d: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { d = await (await fetch('https://kascov.io/data/testnet-10/deploy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ program_hex: prog, value: 1000000000 }) })).json();
      if (d.covenant_id) break;
    } catch (e) { console.log('  retry', attempt + 1, (e as any).code); await new Promise(r => setTimeout(r, 2000)); }
  }
  if (!d || !d.covenant_id) { console.log('❌ deploy failed'); process.exit(1); }
  console.log('🏭 factory covenant:', d.covenant_id);
  let genesis = '';
  for (let i = 0; i < 10 && !genesis; i++) { const t = await (await fetch(`https://kascov.io/data/testnet-10/c/${d.covenant_id}.json`)).text();
    if (t.startsWith('{')) genesis = JSON.parse(t).events[0].txid; else await new Promise(r => setTimeout(r, 5000)); }
  fs.writeFileSync('factory.json', JSON.stringify({ covenantId: d.covenant_id, genesis, counter: 0 }, null, 1));
  console.log('📜 factory genesis:', genesis);
})();
