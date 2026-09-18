const urls = [
  'https://rps.sealver.stream/assets/main-DxAUMh_P.js',
  'https://rps.sealver.stream/assets/transaction-funding-CpvXGx7L.js',
  'https://rps.sealver.stream/assets/preload-helper-Czpn1I53.js'
];
(async () => {
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (!r.ok) { console.log(u, 'status', r.status); continue; }
      const t = await r.text();
      const idx = t.indexOf('qpzry9x8gf2tvdw0s3jn54khce6mua7l');
      if (idx >= 0) {
        console.log('FOUND in', u, 'at', idx);
        console.log('CONTEXT:');
        console.log(t.substring(Math.max(0, idx-300), idx+1000));
      } else {
        console.log('charset not in', u);
      }
    } catch (e) { console.log(u, 'err:', e.message); }
  }
})();
