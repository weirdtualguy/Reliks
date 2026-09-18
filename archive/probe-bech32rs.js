const fs = require('fs');
(async () => {
  for (const p of ['crypto/addresses/src/bech32.rs', 'utils/src/bech32.rs', 'crypto/bech32/src/lib.rs']) {
    const url = 'https://cdn.jsdelivr.net/gh/kaspanet/rusty-kaspa@master/' + p;
    try {
      const r = await fetch(url);
      if (!r.ok) { console.log(p, '->', r.status); continue; }
      const t = await r.text();
      fs.writeFileSync('bech32.rs', t);
      console.log('=== HIT', p, t.length, 'bytes — FULL FILE BELOW ===');
      console.log(t);
      break;
    } catch (e) { console.log(p, 'err', e.message); }
  }
})();
