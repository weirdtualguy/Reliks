// Guards docs/studio.html: no drift from its generator, self-contained, templates assemble and render in Node across many patinas.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('PASS ' + n); } catch (e) { fail++; console.log('FAIL ' + n + ' | ' + e.message); } };
const out = path.join(os.tmpdir(), 'reliks-studio-' + process.pid + '.html');
cp.execFileSync('node', [path.join(root, 'tools', 'gen-studio.js')], { env: { ...process.env, RELIKS_STUDIO_OUT: out }, stdio: 'pipe' });
const built = fs.readFileSync(out, 'utf8'); fs.unlinkSync(out);
const shipped = fs.readFileSync(path.join(root, 'docs', 'studio.html'), 'utf8');
t('docs/studio.html is exactly what `npm run studio` produces', () => { if (built !== shipped) throw new Error('run: npm run studio'); });
t('no external script, stylesheet or network call', () => {
  if (/<script[^>]+\ssrc=/i.test(built) || /<link[^>]+rel=["']?stylesheet/i.test(built)) throw new Error('external asset');
  const app = fs.readFileSync(path.join(root, 'web', 'studio-vm-app.js'), 'utf8');
  if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|import\s*\(|innerHTML|eval\s*\(/.test(app)) throw new Error('forbidden construct in studio-vm-app.js');
  const urls = (built.match(/https?:\/\/[^\s"'<>)]+/g) || []).filter(u => !/^http:\/\/www\.w3\.org\//.test(u));
  if (urls.length) throw new Error(urls.join(', '));
});
const A = require('../web/rvm-asm.js'), R = require('../v13/vm/rvm.js'), b2 = u => require('../web/blake2b.js').blake2b(u, 32);
const T = { starter: fs.readFileSync(path.join(root, 'web', 'vm-templates', 'iso.txt'), 'utf8'), circles: fs.readFileSync(path.join(root, 'web', 'vm-templates', 'starter.txt'), 'utf8'), dagcity: fs.readFileSync(path.join(root, 'v13', 'vm', 'asm-corpus', 'dagcity_clean.txt'), 'utf8') };
for (const [name, src] of Object.entries(T)) t('template ' + name + ' assembles and renders (16 lineages x 2 serials x wear 0/255)', () => {
  const prog = A.assemble(src), themes = new Set(); let big = 0;
  for (let l = 0; l < 16; l++) {
    const lin = b2(Uint8Array.of(l));
    for (const s of ['1', '9223372036854775807']) for (const w of [0, 255]) {
      const hi = R.hostInputs(b2, s, lin, w), svg = R.render(prog, hi.lanes, hi.serial32, hi.pat, hi.wear);
      if (svg.indexOf('<svg') !== 0 || !/<\/svg>$/.test(svg)) throw new Error('bad svg, lineage ' + l + ' serial ' + s + ' wear ' + w);
      themes.add(hi.pat & 3); big = Math.max(big, svg.length);
    }
  }
  console.log('  ' + name + ': program ' + prog.length + ' B, patina themes seen ' + themes.size + '/4, largest svg ' + big + ' B');
});
console.log('studio-test:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
