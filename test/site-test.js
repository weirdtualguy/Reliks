// Guards the published page: self-contained, no drift from the generators, honest wording.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('PASS ' + n); } catch (e) { fail++; console.log('FAIL ' + n + ' | ' + e.message); } };
const out = path.join(os.tmpdir(), 'reliks-site-' + process.pid + '.html');
cp.execFileSync('node', [path.join(root, 'gen-site.js')], { env: { ...process.env, RELIKS_OUT: out }, stdio: 'pipe' });
const built = fs.readFileSync(out, 'utf8'), shipped = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');
fs.unlinkSync(out);

t('docs/index.html is exactly what `npm run site` produces (no drift)', () => { if (built !== shipped) throw new Error('run: npm run site'); });
t('no external <script src> and no <link rel=stylesheet>', () => { if (/<script[^>]+\ssrc=/i.test(built) || /<link[^>]+rel=["']?stylesheet/i.test(built)) throw new Error('external asset'); });
t('no CDN reference outside the lazily loaded, pinned WalletConnect URL', () => {
  const hits = (built.match(/https?:\/\/(?:esm\.sh|cdn\.[^\s"'\/]+|unpkg\.com|cdnjs\.[^\s"'\/]+|fonts\.googleapis\.com)[^\s"'`)]*/g) || []);
  const bad = hits.filter(u => !/^https:\/\/esm\.sh\/@walletconnect\/sign-client@\d+\.\d+\.\d+$/.test(u) && u !== 'https://esm.sh/');
  if (bad.length) throw new Error(bad.join(', '));
});
t('WalletConnect is only reachable through a dynamic import()', () => {
  if (/^\s*import\s.+from\s/m.test(built)) throw new Error('static import found');
  if (!/import\(WC_SDK\)/.test(built)) throw new Error('dynamic import missing');
});
t('page uses no innerHTML with dynamic data except the QR svg', () => {
  const uses = built.match(/\.innerHTML\s*=/g) || []; if (uses.length > 1) throw new Error(uses.length + ' innerHTML assignments');
});
t('no private-key handling in browser code', () => { if (/PC_PRIV|privateKey|secretKey|mnemonic|seed phrase/i.test(built.replace(/ReliksSeedV10/g, ''))) throw new Error('key material referenced'); });
t('honest wording: never claims audited, zero fee or pruning-proof', () => {
  const visible = built.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  if (/\bzero[- ]fee\b|\bfully audited\b|survives pruning\b(?![^<]*Not claimed)/i.test(visible.replace(/<td>The art survives pruning<\/td>/, ''))) throw new Error('overclaim in visible text');
});
t('every mainnet anchor is present in the page data', () => { const a = require(path.join(root, 'data', 'mainnet-anchors.json')); a.series.forEach(s => { if (!built.includes(s.programHash) || !built.includes(s.laneCovenantId)) throw new Error(s.id); }); });
t('page stays small (< 300 KB)', () => { if (built.length > 300000) throw new Error(built.length + ' bytes'); });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
