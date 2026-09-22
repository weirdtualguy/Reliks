const fs = require('fs');
const crypto = require('crypto');
const N = require('./network.js');
const { blake2b: noble } = require('@noble/hashes/blake2b');
const RB = require('./web/gallery-blake2b.js');
const V = require('./v8-lib.js');
const ENGINE = require(process.env.RELIKS_ENGINE || './reliks-engine-v10.js');

const hx = (b) => Buffer.from(b).toString('hex');
function assert(cond, msg) { if (!cond) { console.error('PARITY FAIL: ' + msg); process.exit(1); } }

/* 1) blake2b cross-validation (incl. real artifact bytes) */
const vectors = [new Uint8Array(0), new TextEncoder().encode('abc'), Buffer.from(ENGINE.ENGINE_SRC, 'utf8')];
for (let len = 0; len <= 300; len++) { const b = new Uint8Array(len); for (let i = 0; i < len; i++) b[i] = (i * 31 + len * 7) & 0xff; vectors.push(b); }
for (let k = 0; k < 20; k++) vectors.push(new Uint8Array(crypto.randomBytes(1 + (k * 37) % 512)));
for (const v of vectors) assert(hx(noble(v, { dkLen: 32 })) === hx(RB.blake2b(v, 32)), 'blake2b vector len ' + v.length);
console.log('blake2b cross-validation:', vectors.length, 'vectors OK (incl. engine bytes)');

/* 2) artifacts + registry */
const LD = JSON.parse(fs.readFileSync((process.env.RELIKS_LEDGER || 'data/factory-ledger-v11.json'), 'utf8'));
const INIT_MINTS = JSON.parse(fs.readFileSync((process.env.RELIKS_ARGS || 'data/factory-args-v11.json'), 'utf8'))[4].value;
const F = V.parts(JSON.parse(fs.readFileSync((process.env.RELIKS_FACTORY_ABI || 'data/factory-abi-v11.json'), 'utf8')));
const Ed = V.parts(JSON.parse(fs.readFileSync('data/edition-abi-v6.json', 'utf8')));
const tHash = (c) => (Array.isArray(c.compiled.template_hash) ? Buffer.from(c.compiled.template_hash) : Buffer.from(c.compiled.template_hash, 'hex')).toString('hex');
const REG = {
  rest: N.rest, explorer: N.explorer, hrp: N.hrp,
  C: LD.C, genesisTxId: LD.genesisTxId, series: LD.series, initMints: INIT_MINTS,
  editions: LD.editions || [],
  factoryPrefix: hx(F.prefix), factorySuffix: hx(F.suffix), factoryTemplateHash: tHash(F.c),
  editionPrefix: hx(Ed.prefix), editionSuffix: hx(Ed.suffix), editionTemplateHash: tHash(Ed.c),
  engineSrc: ENGINE.ENGINE_SRC, testSerial: ENGINE.TEST_SERIAL || 1
};

/* 3) runtime parity against the proven Node chain */
const runtimeSrc = fs.readFileSync('web/reliks-gallery-runtime.js', 'utf8');
const selfObj = {};
const RG = new Function('RB2B', 'REG', 'self', runtimeSrc + '\n;return self.ReliksGallery;')(RB.blake2b, REG, selfObj);
const p2shNode = (b) => { const x = V.p2sh(b); return typeof x === 'string' ? x : Buffer.from(x).toString('hex'); };

assert(RG.serialOfV10(LD.genesisTxId, 0) === String(LD.editions[0].serial), 'serial #0');
for (let i = 1; i < LD.editions.length; i++) assert(RG.serialOfV10(LD.editions[i - 1].mintTxId, 0) === String(LD.editions[i].serial), 'serial #' + i);
for (let m = INIT_MINTS; m >= 0; m--) {
  const st = { ...LD.series, mints_left: m };
  assert(hx(RG.encFactoryState(st)) === V.encState(F, st).toString('hex'), 'factory encState mints=' + m);
  assert(RG.factorySpk(m) === p2shNode(Buffer.concat([F.prefix, V.encState(F, st), F.suffix])), 'factory spk mints=' + m);
}
for (const ed of LD.editions) {
  const st = RG.editionState(ed);
  assert(hx(RG.encEditionState(st)) === V.encState(Ed, st).toString('hex'), 'edition encState ' + ed.serial);
  assert(RG.editionSpk(ed) === p2shNode(Buffer.concat([Ed.prefix, V.encState(Ed, st), Ed.suffix])), 'edition spk ' + ed.serial);
}
assert(RG.p2pkAddress('20' + V.USER + 'ac') === V.WALLET, 'bech32 P2PK vector == configured wallet address');
assert(RG.blakeHex(RG.utf8(REG.engineSrc)) === ENGINE.engineHashHex, 'engine hash');
assert(RG.blakeHex(RG.utf8(RG.render(String(REG.testSerial)))) === ENGINE.renderHashHex, 'render conformance');
for (const ed of LD.editions) assert(RG.render(String(ed.serial)) === ENGINE.render(Number(BigInt(ed.serial) & 0xFFFFFFFFn)), 'render parity ' + ed.serial);
console.log('runtime parity: serials, state encodings, spks, engine hash, conformance, renders — all OK');

/* 4) emit self-contained HTML */
const css = 'body{background:#0b0d10;color:#e8e6e3;font-family:ui-monospace,Menlo,Consolas,monospace;margin:0;padding:24px}' +
'h1{font-size:20px;letter-spacing:2px}h1 span{color:#7fd1ae}' +
'.sub{color:#8a9199;font-size:12px;margin-bottom:20px;max-width:760px;line-height:1.5}' +
'ul{list-style:none;padding-left:0}li{margin:4px 0;font-size:12px}' +
'.pass{color:#7fd1ae;font-weight:700}.fail{color:#ff6b6b;font-weight:700}' +
'.card{border:1px solid #23282e;border-radius:10px;padding:16px;margin:16px 0;background:#101418;max-width:760px}' +
'.meta{color:#8a9199;font-size:11px;margin-bottom:8px}.meta a{color:#7fd1ae}' +
'iframe.art{width:100%;max-width:520px;aspect-ratio:1/1;height:auto;border:1px solid #23282e;border-radius:8px;background:#000;display:block;margin-top:10px}' +
'.refuse{color:#ff6b6b;font-size:12px;margin-top:10px}' +
'h2{font-size:14px;margin:18px 0 6px}h3{font-size:13px;margin:0 0 6px}' +
'.note{color:#5c6670;font-size:11px;margin-top:24px;border-top:1px solid #23282e;padding-top:12px;max-width:760px;line-height:1.6}';
const blakeSrc = fs.readFileSync('web/gallery-blake2b.js', 'utf8');
const regJson = JSON.stringify(REG).replace(/</g, '\\u003c');
const html = [
  '<!doctype html>', '<html lang="en"><head>', '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<title>Reliks — Generative Gallery v10</title>',
  '<style>' + css + '</style></head><body>',
  '<h1>RELIKS <span>// generative gallery v10</span></h1>',
  '<div class="sub">Trustless render chain. The inlined registry is an untrusted hint: every field is re-anchored against live chain commitments by reconstructing each P2SH scriptPubKey from claimed state + template and comparing it to what the chain recorded. The 901-byte engine is bundled in this page and anchored to the on-chain program_hash. Art is withheld on any mismatch. No IPFS. No reveal sigscripts.</div>',
  '<div id="status">verifying against ' + N.rest + ' …</div>',
  '<h2>Editions</h2>', '<div id="editions"></div>',
  '<div class="note">Prune-proof model: artwork = render(engine, serial mod 2^32), integer-only deterministic math. Engine anchored by blake2b(engine) == state[0] program_hash; renderer proven canonical by blake2b(render(1)) == render_hash; serials recomputed from lane outpoints via the ReliksSerialV10 LE63 polynomial; lineage authenticated output-by-output against the chain. Live (unspent) outputs anchor against the never-pruned UTXO set via bech32 P2SH addresses; spent outputs fall back to archival sources with explicit labeling.</div>',
  '<script>' + blakeSrc + '<\/script>',
  '<script>window.RB2B = window.ReliksBlake2b.blake2b; window.REG = ' + regJson + ';<\/script>',
  '<script>' + runtimeSrc + '<\/script>',
  '<script>ReliksGallery.runAll().catch(function(e){document.getElementById("status").textContent="FATAL: "+(e&&e.message||e);});<\/script>',
  '</body></html>'
].join('\n');
fs.writeFileSync('reliks-gallery-v10.html', html);
console.log('reliks-gallery-v10.html written (' + html.length + ' bytes) | editions:', REG.editions.length);
console.log('open with: termux-open reliks-gallery-v10.html');
