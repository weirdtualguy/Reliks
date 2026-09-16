const fs = require('fs');
const pend = process.argv[2] || 'factory3-pending.json';
const out = process.argv[3] || 'factory3.json';
if (fs.existsSync(out)) { const j = JSON.parse(fs.readFileSync(out, 'utf8'));
  if (j.genesis) { console.log('✅ factory3.json already has genesis:', j.genesis); process.exit(0); } }
if (!fs.existsSync(pend)) { console.log('❌ no pending file at', pend); process.exit(1); }
const F = JSON.parse(fs.readFileSync(pend, 'utf8'));
(async () => {
  for (let i = 0; i < 10; i++) {
    try { const r = await fetch(`https://kascov.io/data/testnet-10/c/${F.covenantId}.json`);
      const j = await r.json(); const g = j.events && j.events[0] && j.events[0].txid;
      if (g) { F.genesis = g; fs.writeFileSync(out, JSON.stringify(F, null, 1)); console.log('✅ genesis:', g, '→', out); return; } }
    catch (e) {}
    await new Promise(r => setTimeout(r, 4000));
  }
  console.log('❌ still not indexed — rerun: node fix-genesis2.js ' + pend + ' ' + out);
  process.exit(1);
})();
