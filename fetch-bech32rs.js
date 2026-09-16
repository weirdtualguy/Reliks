const fs = require('fs');
(async () => {
  const url = 'https://cdn.jsdelivr.net/gh/kaspanet/rusty-kaspa@master/crypto/addresses/src/bech32.rs';
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) { const t = await r.text(); fs.writeFileSync('bech32.rs', t); console.log('✅ saved bech32.rs', t.length, 'bytes'); console.log(t); return; }
      console.log('status', r.status); return;
    } catch (e) { console.log('retry', i + 1, e.message); await new Promise(r => setTimeout(r, 3000)); }
  }
})();
