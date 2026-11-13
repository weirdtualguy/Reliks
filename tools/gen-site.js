// Builds docs/index.html: one self-contained page (GitHub Pages serves docs/).
// No external scripts, styles or fonts. Everything the page verifies is recomputed in the browser.
// Supports both v12 JavaScript engines and v13 Reliks-VM (RVM\x01, engine_lang = 2) programs,
// plus offline provenance bundle & claim verification.
// The only optional third-party code is the pinned WalletConnect SDK, fetched at runtime
// when a visitor explicitly picks "Kaspire Mobile" (see web/kaspire.js).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const scriptSafe = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const json = (o) => scriptSafe(JSON.stringify(o)).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const { blake2b } = require(path.join(ROOT, 'web', 'blake2b.js'));
const RVM = require(path.join(ROOT, 'v13', 'vm', 'rvm.js'));
const hx = (u) => Buffer.from(u).toString('hex');
const hashHex = (u) => hx(blake2b(u instanceof Uint8Array ? u : new Uint8Array(u), 32));

const anchors = JSON.parse(process.env.RELIKS_ANCHORS ? fs.readFileSync(process.env.RELIKS_ANCHORS, 'utf8') : read('data', 'mainnet-anchors.json')); // RELIKS_ANCHORS / RELIKS_OUT exist for test builds
const makeTemplates = require('../lib/reliks-templates.js');
const templates = makeTemplates();
const templatesV13 = makeTemplates({ editionAbi: 'edition-abi-v13.json' });
const studioTemplates = require('../web/studio-templates.js');

// Studio prelude: the small integer-only helper API every studio engine starts with.
const PRELUDE = [
  'var R=(function(L,serial){',
  'var x=(L[0]^serial)|0,y=L[1]|0,z=L[2]|0,w=L[3]|0;',
  'function rnd(){var t=(x^(x<<11))|0;x=y;y=z;z=w;w=(w^(w>>>19))^(t^(t>>>8));return w>>>0;}',
  'function ri(a,b){return a+(rnd()%(b-a+1));}',
  'function pick(a){return a[rnd()%a.length];}',
  'function chance(p){return rnd()%100<p;}',
  "function hsl(){return 'hsl('+rnd()%360+','+ri(40,90)+'%,'+ri(30,70)+'%)';}",
  'function sin(a){a&=4095;var s=a<2048?1:-1,q=a<2048?a:a-2048,u=q*(2048-q);return s*(16*u*10000/(20971520-4*u)|0);}',
  'function cos(a){return sin(a+1024);}',
  'function dir(a,len){return [cos(a)*len/10000|0,sin(a)*len/10000|0];}',
  "function svg(parts,bg){return '<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1000 1000\">'+(bg?'<rect width=\"1000\" height=\"1000\" fill=\"'+bg+'\"/>':'')+parts.join('')+'</svg>';}",
  'return {rnd:rnd,ri:ri,pick:pick,chance:chance,hsl:hsl,sin:sin,cos:cos,dir:dir,svg:svg,serial:serial,lanes:L};',
  '})(L,serial);'
].join('\n');
const CAP = Number(process.env.RELIKS_ENGINE_CAP || 25641);

const engines = {};
for (const s of anchors.series) {
  const isVm = Number(s.engine_lang) === 2 || typeof s.programHex === 'string' || typeof s.programFile === 'string' || (typeof s.engine === 'string' && /\.(hex|rvm)$/i.test(s.engine));
  if (isVm) {
    const key = s.engine || s.programFile || s.id;
    let progHex = s.programHex;
    if (!progHex && (s.programFile || s.engine)) {
      const pFile = s.programFile || s.engine;
      const fullPath = fs.existsSync(path.join(ROOT, pFile)) ? path.join(ROOT, pFile) : path.join(ROOT, 'v13', pFile);
      const raw = fs.readFileSync(fullPath, 'utf8').trim();
      progHex = /^[0-9a-fA-F\s]+$/.test(raw) && /^52564d01/i.test(raw.replace(/\s+/g, ''))
        ? raw.replace(/\s+/g, '').toLowerCase()
        : hx(require(path.join(ROOT, 'web', 'rvm-asm.js')).assemble(raw));
    }
    const progBytes = new Uint8Array(Buffer.from(progHex, 'hex'));
    const ph = hashHex(progBytes);
    if (ph !== s.programHash) throw new Error('anchor mismatch: VM program ' + key + ' hashes to ' + ph + ', anchors say ' + s.programHash);
    const hi1 = RVM.hostInputs(blake2b, '1', new Uint8Array(32), 0);
    const svg1 = RVM.render(progBytes, hi1.lanes, hi1.serial32, hi1.pat, hi1.wear);
    const rh = hashHex(new TextEncoder().encode(svg1));
    if (rh !== s.renderHash) throw new Error('anchor mismatch: VM render hash of ' + key + ' is ' + rh + ', anchors say ' + s.renderHash);
    s.engine = key;
    s.engineKind = 'vm';
    if (s.engine_lang === undefined) s.engine_lang = 2;
    engines[key] = progHex;
  } else {
    const E = require(path.join(ROOT, 'lib', s.engine));
    if (E.engineHashHex !== s.programHash) throw new Error('anchor mismatch: ' + s.engine + ' hashes to ' + E.engineHashHex + ', anchors say ' + s.programHash);
    if (E.renderHashHex !== s.renderHash) throw new Error('anchor mismatch: render hash of ' + s.engine);
    s.engineKind = 'js';
    if (s.engine_lang === undefined) s.engine_lang = 1;
    engines[s.engine] = E.ENGINE_SRC;
  }
}

let bundles = {};
try {
  const b12Path = path.join(ROOT, 'data', 'provenance-v12-genesis.json');
  const b13Path = path.join(ROOT, 'v13', 'provenance-v13-demo.json');
  if (fs.existsSync(b12Path)) {
    const b12 = JSON.parse(fs.readFileSync(b12Path, 'utf8'));
    delete b12.templates; // page already embeds D.templates
    bundles.v12 = b12;
  }
  if (fs.existsSync(b13Path)) {
    const b13 = JSON.parse(fs.readFileSync(b13Path, 'utf8'));
    delete b13.templates; // page already embeds D.templatesV13
    bundles.v13 = b13;
  }
} catch (e) {}

const DATA = { anchors, templates, templatesV13: { edition: templatesV13.edition }, engines, bundles, studio: { prelude: PRELUDE, templates: studioTemplates, cap: CAP } };
const favicon = 'data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#06080b'/><path d='M32 10l20 11v22L32 54 12 43V21z' fill='none' stroke='#49c5b1' stroke-width='4'/><path d='M32 10v44M12 21l40 22M52 21L12 43' stroke='#49c5b1' stroke-width='2' opacity='.5'/></svg>");

const view = (id, inner) => `<section class="view" id="view-${id}" ${id === 'gallery' ? '' : 'hidden'}>${inner}</section>`;

const gallery = `
<div class="hero">
  <span class="eyebrow">Generative art on Kaspa</span>
  <h1>The artwork is a <em>program</em>. Its hash lives in the contract.</h1>
  <p>Reliks anchors a small deterministic engine (JavaScript or Reliks-VM bytecode) inside a Kaspa covenant. Anyone can re-render every edition from public chain data or an offline provenance bundle. This page does exactly that in your browser, and withholds the art if any check fails.</p>
</div>
<div class="section-h"><h2>Series</h2><span>every number below is read from the chain, not from this page</span></div>
<div id="series-host"></div>
<div class="section-h"><h2>Offline &amp; Air-Gapped Verifier</h2><span>verify and render any provenance bundle or claim with zero network access</span></div>
<div id="offline-host"></div>
<div class="section-h"><h2>How to read the proof</h2></div>
<div class="cards">
  <div class="card"><span class="tag v">Recomputed here</span><h3>Engine and image</h3><p>The engine bytes (JS or Reliks-VM bytecode) are hashed and rendered locally in a Web Worker, then compared with the hashes committed on chain.</p></div>
  <div class="card"><span class="tag v">Recomputed here</span><h3>Contract scripts</h3><p>Each edition's script is rebuilt from its claimed state and must equal the output the mint transaction created across available sources.</p></div>
  <div class="card"><span class="tag d">By design</span><h3>Nothing to pay the platform</h3><p>The contracts contain no treasury or marketplace fee. Network fees still apply.</p></div>
  <div class="card"><span class="tag n">Not claimed</span><h3>Audited</h3><p>The contracts had automated reviews, not a formal third-party audit. Start small.</p></div>
</div>`;

const studio = `
<div class="hero" style="padding-bottom:8px"><span class="eyebrow">Studio</span><h1>Design an engine. <em>Gate</em> it. Export it.</h1>
<p>Write the engine in the browser and run the same determinism gates the command line uses. For Reliks-VM bytecode engines, open <code>docs/studio.html</code> or run <code>node cli/reliks-lens-vm.js</code>.</p></div>
<div class="row" style="margin:20px 0 14px">
  <input id="name" value="my-engine" aria-label="Series name" style="max-width:220px" />
  <select id="tpl" aria-label="Template" style="max-width:180px"><option value="dagcity" selected>DAG City (mainnet)</option><option value="circles">Circles</option><option value="flow">Flow field</option><option value="blank">Blank</option></select>
  <button class="btn" id="load">Load template</button>
</div>
<div class="studio">
  <div><label class="sr" for="ed">Engine code</label><textarea id="ed" class="editor" spellcheck="false"></textarea></div>
  <div style="display:grid;gap:14px;align-content:start">
    <div class="art-wrap" id="prev-box" style="border-radius:14px;overflow:hidden;background:#000"></div>
    <div class="row"><input id="ser" value="1" inputmode="numeric" aria-label="Serial" style="max-width:150px" /><button class="btn" id="go">Render</button><button class="btn" id="rnd">Random</button><button class="btn" id="run-gates">Run gates</button></div>
    <div class="gate-list" id="gates-out" aria-live="polite"></div>
    <pre class="code" id="hashes"></pre>
    <div class="status-line" id="studio-status" aria-live="polite"></div>
  </div>
</div>
<div class="section-h"><h2>Export</h2></div>
<div class="cards">
  <div class="card"><h3>Engine file</h3><p style="margin-bottom:14px">A Node module that <code>reliks-lens.js</code> and the deploy tools consume. Export is blocked while a gate fails.</p><button class="btn primary" id="exe">Export engine (.js)</button></div>
  <div class="card"><h3>Series file</h3>
    <div class="field"><label for="artist">Artist key (x-only, 64 hex)</label><input id="artist" placeholder="filled from Kaspire when connected" /></div>
    <div class="row"><div class="field"><label for="price">Price (KAS)</label><input id="price" value="1" inputmode="decimal" /></div><div class="field"><label for="roy">Royalty %</label><input id="roy" value="5" inputmode="decimal" /></div><div class="field"><label for="eds">Editions</label><input id="eds" value="8" inputmode="numeric" /></div></div>
    <button class="btn" id="exs">Export series (.json)</button></div>
  <div class="card"><h3>Then, on your computer</h3><ol class="steps" style="margin-top:6px"><li><span><code>node cli/reliks-lens.js my-engine.js</code> (or <code>cli/reliks-lens-vm.js</code>)</span></li><li><span><code>node cli/gen-factory-args.js series-my-engine.json</code></span></li><li><span>compile with <code>silverc</code>, then <code>node cli/deploy-v12.js</code></span></li></ol></div>
</div>`;

const protocol = `
<div class="hero" style="padding-bottom:8px"><span class="eyebrow">Protocol</span><h1>What Reliks is, and what it is <em>not</em>.</h1>
<p>Reliks is three Silverscript covenants, the Reliks-VM deterministic bytecode runtime, and a set of verification tools. It is not a marketplace, an indexer or an audited product. This page keeps the claims small enough to check.</p></div>
<div class="section-h"><h2>Claims</h2></div>
<table class="claims"><thead><tr><th style="width:34%">Claim</th><th style="width:16%">Status</th><th>Basis</th></tr></thead><tbody>
<tr><td>The image is a function of (engine, serial[, lineage, sales])</td><td><span class="tag v">Checked in page</span></td><td>Engine hash, image hash and serial are recomputed on load (both JS and Reliks-VM).</td></tr>
<tr><td>The engine cannot be swapped after mint</td><td><span class="tag d">Contract</span></td><td>program_hash is part of covenant state and of every successor's script.</td></tr>
<tr><td>Serials never collide across parallel lanes</td><td><span class="tag d">Contract</span></td><td>Serial is derived from the consumed lane outpoint; the page recomputes it.</td></tr>
<tr><td>No protocol fee</td><td><span class="tag d">Contract</span></td><td>Primary sale pays the artist exactly the price. Network fees (about 0.04 KAS per mint) still apply.</td></tr>
<tr><td>Royalties on resale</td><td><span class="tag d">Contract, partly</span></td><td>Enforced on covenant-priced sales (list/buy, escrow accept). <code>transfer</code> and zero-price <code>sell</code> are royalty-free by design.</td></tr>
<tr><td>The art survives pruning</td><td><span class="tag n">Not claimed</span></td><td>The hash is anchored on chain and the engine bytes ship in the contract script, but pruned nodes may drop old transactions. Keep a copy of the engine or provenance bundle (this repository has both).</td></tr>
<tr><td>Audited</td><td><span class="tag n">No</span></td><td>Automated review passes only. See <code>docs/AUDIT-SUMMARY.md</code>.</td></tr>
<tr><td>Buy, sell and offer in the browser</td><td><span class="tag n">Not yet</span></td><td>This page mints and verifies. Listing, buying and offers run through the command-line tools today.</td></tr>
</tbody></table>
<div class="section-h"><h2>Wallet</h2></div>
<div class="cards">
  <div class="card"><span class="tag d">Recommended</span><h3>Kaspire Extension</h3><p>Injected <code>window.kaspire</code> provider. No relay, no QR, no third-party script. It signs the mint's wallet input and broadcasts with <code>pushTx</code>.</p></div>
  <div class="card"><span class="tag d">Android</span><h3>Kaspire Mobile</h3><p>WalletConnect v2, loaded only when you choose it. It can connect and sign. Covenant transactions cannot be broadcast through public REST, so paste your own node address, or use the extension.</p></div>
  <div class="card"><span class="tag n">Honest limit</span><h3>Test small</h3><p>The wallet flow follows Kaspire's published API and is tested against mocks. Try it first on a series with editions left, with a low-value wallet.</p></div>
</div>
<div class="section-h"><h2>How a mint works</h2></div>
<ol class="steps">
<li><span>The page rebuilds the live lane state from public chain data and proves it recomputes to the on-chain script.</span></li>
<li><span>It builds one transaction: the lane advances by one, a new edition covenant is created with a 1 KAS carrier, and the artist is paid the price.</span></li>
<li><span>Kaspire shows its own review of that exact transaction and signs only your funding input.</span></li>
<li><span>The page checks that the signed transaction still matches what you reviewed, and only then broadcasts.</span></li>
</ol>
<p class="note" style="margin-top:28px">Source, contracts and tests: <a href="https://github.com/weirdtualguy/Reliks" target="_blank" rel="noopener">github.com/weirdtualguy/Reliks</a>. MIT licensed.</p>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: https://esm.sh/ ; style-src 'unsafe-inline'; img-src 'self' data: blob:; worker-src blob:; frame-src 'self' data: blob:; connect-src https://api.kaspa.org https://kascov.io https://esm.sh/ ws: wss:">
<title>Reliks: generative art whose code lives in a Kaspa covenant</title>
<meta name="description" content="Reliks anchors a deterministic generative engine inside a Kaspa covenant. Re-render and verify every edition in your browser.">
<meta name="theme-color" content="#06080b">
<link rel="icon" href="${favicon}">
<style>${read('web', 'site.css')}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="bar">
  <a class="brand" href="#gallery" aria-label="Reliks home"><b>RELIKS</b><i>Generative art on Kaspa</i></a>
  <nav class="tabs" aria-label="Sections">
    <button data-tab="gallery" aria-selected="true">Gallery</button>
    <button data-tab="studio" aria-selected="false">Studio</button>
    <button data-tab="protocol" aria-selected="false">Protocol</button>
  </nav>
  <span class="spacer"></span>
  <button class="chip primary" id="wallet-btn" aria-haspopup="dialog"><span class="dot" id="wallet-dot" hidden></span><span id="wallet-label">Connect wallet</span></button>
</header>
<main id="main">
${view('gallery', gallery)}
${view('studio', studio)}
${view('protocol', protocol)}
</main>
<footer><span>Reliks v13 · MIT · not financial advice, not audited</span><span><a href="https://github.com/weirdtualguy/Reliks" target="_blank" rel="noopener">Source</a> · <a href="https://kaspire.kaslab.space" target="_blank" rel="noopener">Kaspire wallet</a></span></footer>
<dialog id="wallet-dlg" aria-label="Connect wallet"><div class="dlg" id="wallet-body"></div></dialog>
<dialog id="mint-dlg" aria-label="Mint"><div class="dlg" id="mint-body"></div></dialog>
<div class="toasts" id="toasts" aria-live="polite"></div>
<script type="text/plain" id="qr-src">${scriptSafe(read('web', 'vendor', 'qrcode-generator.js'))}</script>
<script type="text/plain" id="rvm-src">${scriptSafe(read('v13', 'vm', 'rvm.js'))}</script>
<script>window.RELIKS_DATA=${json(DATA)};
window.RVM=(function(){var module={exports:{}};(0,eval)(document.getElementById('rvm-src').textContent);return module.exports;})();
window.__qr=function(){if(!window.qrcode){(0,eval)(document.getElementById('qr-src').textContent);}return window.qrcode;};</script>
<script>${scriptSafe(read('web', 'blake2b.js'))}</script>
<script>${scriptSafe(read('web', 'reliks-chain.js'))}</script>
<script>${scriptSafe(read('web', 'kaspire.js'))}</script>
<script>${scriptSafe(read('web', 'site-app.js'))}</script>
</body>
</html>
`;

fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
const OUT = process.env.RELIKS_OUT || path.join(ROOT, 'docs', 'index.html');
fs.writeFileSync(OUT, html);
console.log(path.relative(ROOT, OUT) + ' written (' + html.length + ' bytes) | no external scripts | anchors verified against engines');
