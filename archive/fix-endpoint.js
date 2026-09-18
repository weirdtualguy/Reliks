const fs = require('fs');
const endpoints = [
  'https://api.kaspa.org',
  'https://api.kaspa.finance',
  'https://kaspa-api.duckdns.org',
  'https://api.kaspa.dedicatednodes.io',
  'https://api.kaspa.swoops.io'
];
(async () => {
  const N = require('./network.js');
  if (N.NET !== 'mainnet') { console.log('not mainnet'); return; }
  for (const url of endpoints) {
    try {
      const r = await fetch(url + '/info');
      if (r.ok) {
        const j = await r.json();
        if (j.isSynced) {
          console.log('✅ found working endpoint:', url);
          let code = fs.readFileSync('network.js', 'utf8');
          // Replace the old URL with the new one
          code = code.replace(/https:\/\/[^'"]+kaspa[^'"]*/g, url);
          fs.writeFileSync('network.js', code);
          console.log('patched network.js');
          return;
        }
      }
    } catch (e) { console.log('  skip', url, e.message.slice(0, 40)); }
  }
  console.log('❌ no working endpoint found among the list');
})();
