(async () => {
  // 1) real published versions of kaspa-wasm
  try {
    const r = await fetch('https://registry.npmjs.org/kaspa-wasm');
    const j = await r.json();
    console.log('dist-tags:', JSON.stringify(j['dist-tags']));
    console.log('last versions:', Object.keys(j.versions || {}).slice(-8).join(', '));
  } catch (e) { console.log('registry err:', e.message); }
  // 2) where does the RPS game get its kaspa wasm/js from?
  try {
    const t = await (await fetch('https://rps.sealver.stream/assets/main-DxAUMh_P.js')).text();
    const hits = new Set();
    for (const m of t.matchAll(/["'`][^"'`]{4,120}(?:kaspa|wasm)[^"'`]{0,120}["'`]/gi)) hits.add(m[0]);
    [...hits].slice(0, 25).forEach(h => console.log('RPS:', h));
  } catch (e) { console.log('rps err:', e.message); }
})();
