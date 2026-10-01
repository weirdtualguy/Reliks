// Cross-checks JS vs Python interpreters on the wear-wash program over a grid of serials, lineages and wear values. Repo root.
const fs = require('fs'), cp = require('child_process'), path = require('path');
const R = require(path.resolve('v13/vm/rvm.js')), M = require(path.resolve('web/blake2b.js')).blake2b, b2 = u => M(u, 32);
const hex = fs.readFileSync(process.env.PROG_HEX_FILE || 'v13/dagcity-wear.hex', 'utf8').trim(), prog = new Uint8Array(Buffer.from(hex, 'hex'));
const cases = []; let x = 12345n;
const rnd = () => { x = (x * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return x; };
for (const w of [0, 1, 2, 3, 7, 50, 51, 128, 255]) for (let i = 0; i < 4; i++) cases.push({ serial: (rnd() >> 1n).toString(), lineage: Buffer.from(Array.from({ length: 32 }, () => Number(rnd() & 255n))).toString('hex'), wear: w });
const py = "import sys,json;sys.path.insert(0,'v13/vm');import rvm\nout=[]\nfor c in json.load(sys.stdin):\n out.append(rvm.b2(rvm.render_edition(bytes.fromhex(sys.argv[1]),int(c['serial']),bytes.fromhex(c['lineage']),c['wear']).encode('ascii')).hex())\nprint(json.dumps(out))";
const r = cp.spawnSync('python3', ['-c', py, hex], { input: JSON.stringify(cases), encoding: 'utf8', maxBuffer: 1 << 28 });
if (r.status !== 0) { console.error('python failed:', r.stderr.slice(-300)); process.exit(1); }
const pyHashes = JSON.parse(r.stdout); let bad = 0, maxLen = 0;
cases.forEach((c, i) => {
  const hi = R.hostInputs(b2, c.serial, new Uint8Array(Buffer.from(c.lineage, 'hex')), c.wear);
  const svg = R.render(prog, hi.lanes, hi.serial32, hi.pat, hi.wear); maxLen = Math.max(maxLen, svg.length);
  const h = Buffer.from(b2(new Uint8Array(Buffer.from(svg, 'ascii')))).toString('hex');
  if (h !== pyHashes[i]) { bad++; console.log('MISMATCH case', i, c.wear); }
});
console.log(cases.length + ' cases, ' + bad + ' mismatches, largest svg ' + maxLen + ' B');
process.exit(bad ? 2 : 0);
