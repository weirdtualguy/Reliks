const fs = require('fs');
const p = 'deploy-v10.js';
let s = fs.readFileSync(p, 'utf8');
const oldSeries = "const series = { program_hash: CH.programHash, artist: V.USER, price: 1000000000, royalty_bips: 500 };\n  const state0 = { ...series, mints_left: 1 };";
const newSeries = `const args = JSON.parse(fs.readFileSync('data/factory-args-v10.json', 'utf8'));
  const series = {
    program_hash: Buffer.from(args[0].value).toString('hex'),
    artist: Buffer.from(args[1].value).toString('hex'),
    price: args[2].value,
    royalty_bips: args[3].value,
    engine_lang: args[6].value,
    render_hash: Buffer.from(args[7].value).toString('hex')
  };
  const state0 = { ...series, mints_left: args[4].value };`;
if (!s.includes(oldSeries)) { console.error('anchor not found'); process.exit(1); }
s = s.split(oldSeries).join(newSeries);
s = s.replace(
  "mintsLeft: Number(JSON.parse(fs.readFileSync('data/factory-args-v10.json','utf8'))[4].value)",
  "mintsLeft: Number(args[4].value)"
);
fs.writeFileSync(p, s);
console.log('patched deploy-v10.js: reads series from args, includes engine_lang + render_hash');
