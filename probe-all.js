(async () => {
  const r = await fetch('https://rps.sealver.stream/');
  const html = await r.text();
  const urls = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
  console.log('Found', urls.length, 'script tags');
  
  for (const u of urls) {
    const full = u.startsWith('http') ? u : 'https://rps.sealver.stream' + u;
    try {
      const res = await fetch(full);
      if (!res.ok) continue;
      const t = await res.text();
      if (t.includes('kaspatest') || t.includes('bech32') || t.includes('polymod')) {
        console.log('\n=== MATCH in', full, '===');
        const idx = t.indexOf('kaspatest');
        if (idx > -1) {
          console.log(t.substring(Math.max(0, idx-300), Math.min(t.length, idx+600)));
        } else {
          const idx2 = t.indexOf('bech32');
          if (idx2 > -1) console.log(t.substring(Math.max(0, idx2-200), Math.min(t.length, idx2+500)));
        }
      }
    } catch(e) { console.log('err', full, e.message); }
  }
})();
