const fs = require('fs');
(async () => {
  let t;
  if (fs.existsSync('kaddr.rs')) t = fs.readFileSync('kaddr.rs', 'utf8');
  else {
    t = await (await fetch('https://cdn.jsdelivr.net/gh/kaspanet/rusty-kaspa@master/crypto/addresses/src/lib.rs')).text();
    fs.writeFileSync('kaddr.rs', t);
  }
  console.log('saved kaddr.rs', t.length, 'bytes');
  const re = /generat|polymod|checksum|expand|charset|const GEN|fn encode|fn decode|PREFIX|version/i;
  const lines = t.split('\n');
  let hits = 0;
  lines.forEach((l, i) => { if (re.test(l)) { console.log((i + 1) + ': ' + l); hits++; } });
  console.log('--- matching lines:', hits);
  if (hits < 5) { console.log('--- fallback: first 60 lines ---'); console.log(lines.slice(0, 60).join('\n')); }
})();
