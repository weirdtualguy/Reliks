const fs = require('fs');
(async () => {
  const F = JSON.parse(fs.readFileSync('factory.json', 'utf8'));
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(`https://kascov.io/data/testnet-10/c/${F.covenantId}.json`);
      const j = await r.json();
      const g = j.events && j.events[0] && j.events[0].txid;
      if (g) { F.genesis = g; fs.writeFileSync('factory.json', JSON.stringify(F, null, 1)); console.log('✅ genesis:', g); return; }
      console.log('retry', i + 1, '(not indexed yet)');
    } catch (e) { console.log('retry', i + 1, e.code || e.message); }
    await new Promise(r => setTimeout(r, 4000));
  }
  console.log('❌ could not fetch genesis'); process.exit(1);
})();
