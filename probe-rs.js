const paths = [
  'crypto/addresses/src/lib.rs',
  'crypto/addresses/src/bech32.rs',
  'utils/src/bech32.rs',
  'addresses/src/lib.rs'
];
(async () => {
  for (const p of paths) {
    const url = 'https://cdn.jsdelivr.net/gh/kaspanet/rusty-kaspa@master/' + p;
    try {
      const r = await fetch(url);
      if (!r.ok) { console.log(p, '->', r.status); continue; }
      const t = await r.text();
      console.log('=== HIT', p, t.length, 'bytes ===');
      const marks = [];
      for (const key of ['GENERATOR', 'fn polymod', 'create_checksum', 'hrp_expand', 'CHECKSUM', 'charset']) {
        let i = t.indexOf(key);
        while (i !== -1 && marks.length < 14) { marks.push(i); i = t.indexOf(key, i + 1); }
      }
      marks.sort((a, b) => a - b);
      for (const i of marks.slice(0, 10)) console.log('---\n' + t.slice(Math.max(0, i - 150), i + 450));
      break;
    } catch (e) { console.log(p, 'err', e.message); }
  }
})();
