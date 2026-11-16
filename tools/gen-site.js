// Builds docs/index.html: one self-contained page (GitHub Pages serves docs/).
// No external scripts, styles or fonts. Everything the page verifies is recomputed in the browser.
// Supports Reliks-VM (RVM\x01) programs, High-Level Reliks-Script DSL in Studio, 1-click Series Publishing
// with Kaspire, multi-UTXO funding, in-browser Secondary Market trading (List, Buy, Cancel Listing,
// Transfer, and 2-party Atomic Bids), collector portfolio filters, and offline provenance bundle verification.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (...a) => fs.readFileSync(path.join(ROOT, ...a), 'utf8');
const scriptSafe = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const compactJs = (src) => {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, "");
  s = s.split("\n").map((l) => {
    let t = l.trim();
    if (!t || t.startsWith("//")) return "";
    const cIdx = t.indexOf(" // ");
    if (cIdx > 0 && !/["'`\/]/.test(t.slice(cIdx + 4))) t = t.slice(0, cIdx).trim();
    return t;
  }).filter(Boolean).join("\n");
  const re = /("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/(?![\/\*])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^\/\\\n])+\/[gimsuy]*)/g;
  let out = "", last = 0, m;
  const cleanCode = (c) => c
    .replace(/[ \t]+/g, " ")
    .replace(/ *([\{\}\(\)\[\]\;\,\:\?\=\+\-\*\&\|\!\<\>]) */g, "$1")
    .replace(/;\n/g, ";")
    .replace(/\{\n/g, "{")
    .replace(/\n\}/g, "}")
    .replace(/,\n/g, ",");
  while ((m = re.exec(s)) !== null) {
    out += cleanCode(s.slice(last, m.index)) + m[0];
    last = re.lastIndex;
  }
  out += cleanCode(s.slice(last));
  return scriptSafe(out);
};
const trimQr = (q) => {
  const i1 = q.indexOf('_this.createDataURL ='), i2 = q.indexOf('return _this;\n  };');
  const i3 = q.indexOf('// byteArrayOutputStream'), i4 = q.indexOf('// returns qrcode function.');
  return (i1 > 0 && i2 > i1 && i3 > i2 && i4 > i3) ? q.slice(0, i1) + q.slice(i2, i3) + q.slice(i4) : q;
};
const compactCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
const json = (o) => scriptSafe(JSON.stringify(o)).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const { blake2b } = require(path.join(ROOT, 'web', 'blake2b.js'));
const RVM = require(path.join(ROOT, 'vm', 'rvm.js'));
const hx = (u) => Buffer.from(u).toString('hex');
const hashHex = (u) => hx(blake2b(u instanceof Uint8Array ? u : new Uint8Array(u), 32));

const anchors = JSON.parse(process.env.RELIKS_ANCHORS ? fs.readFileSync(process.env.RELIKS_ANCHORS, 'utf8') : read('data', 'mainnet-anchors.json'));
const makeTemplates = require('../lib/reliks-templates.js');
const templates = makeTemplates();
const studioTemplates = {
  iso: read('web', 'vm-templates', 'iso.txt'),
  dsl_rings: read('web', 'vm-templates', 'dsl_rings.txt'),
  vm_circles: read('web', 'vm-templates', 'starter.txt'),
  vm_dagcity: read('vm', 'asm-corpus', 'dagcity_clean.txt')
};
const CAP = Number(process.env.RELIKS_ENGINE_CAP || 25641);

const engines = {};
for (const s of anchors.series) {
  const key = s.engine || s.programFile || s.id;
  let progHex = s.programHex;
  if (!progHex && (s.programFile || s.engine)) {
    const pFile = s.programFile || s.engine;
    const fullPath = fs.existsSync(path.join(ROOT, pFile)) ? path.join(ROOT, pFile) : path.join(ROOT, 'vm', pFile);
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
}

let bundles = {};
try {
  const bDemoPath = path.join(ROOT, 'data', 'provenance-demo.json');
  if (fs.existsSync(bDemoPath)) {
    const bDemo = JSON.parse(fs.readFileSync(bDemoPath, 'utf8'));
    delete bDemo.templates;
    if (bDemo.series) delete bDemo.series.program_hex;
    bundles.demo = bDemo;
  }
} catch (e) {}

// Compress repeated edition suffix inside factory.suffixHex to keep index.html compact
const edSufHex = templates.edition.suffixHex;
const fixtureEngHex = templates.factory.suffixHex.slice(79 * 2, (79 + 3888) * 2);
const packedFactory = Object.assign({}, templates.factory, {
  suffixHex: templates.factory.suffixHex.split(fixtureEngHex).join('__FENG__').split(edSufHex).join('__EDS__')
});

const packedEdition = Object.assign({}, templates.edition);
const packedEscrow = Object.assign({}, templates.escrow);
delete packedFactory.fields; delete packedEdition.fields; delete packedEscrow.fields;
const DATA = { anchors, templates: { factory: packedFactory, edition: packedEdition, escrow: packedEscrow }, engines, bundles, studio: { templates: studioTemplates, cap: CAP } };
const favicon = 'data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#06080b'/><path d='M32 10l20 11v22L32 54 12 43V21z' fill='none' stroke='#49c5b1' stroke-width='4'/><path d='M32 10v44M12 21l40 22M52 21L12 43' stroke='#49c5b1' stroke-width='2' opacity='.5'/></svg>");

const view = (id, inner) => `<section class="view" id="view-${id}" ${id === 'gallery' ? '' : 'hidden'}>${inner}</section>`;

const gallery = `
<div class="hero">
  <span class="eyebrow">Generative art on Kaspa</span>
  <h1>The artwork is a <em>program</em>. Its hash lives in the contract.</h1>
  <p>Reliks anchors a small deterministic Reliks-VM program inside a Kaspa covenant. Anyone can re-render every edition from public chain data or an offline provenance bundle. This page does exactly that in your browser, and withholds the art if any check fails.</p>
</div>
<div class="section-h"><h2>Series &amp; Secondary Market</h2><span>every number below is read from the chain, not from this page</span></div>
<div class="row" id="gallery-filters" style="margin:0 0 16px;flex-wrap:wrap;gap:8px" role="group" aria-label="Filter editions"></div>
<div id="series-host"></div>
<div id="custom-series-host" style="margin-top:18px"></div>
<div class="section-h"><h2>Offline &amp; Air-Gapped Verifier</h2><span>verify and render any provenance bundle or claim with zero network access</span></div>
<div id="offline-host"></div>
<div class="section-h"><h2>How to read the proof</h2></div>
<div class="cards">
  <div class="card"><span class="tag v">Recomputed here</span><h3>Program and image</h3><p>The Reliks-VM bytecode is hashed and rendered locally in a Web Worker, then compared with the hashes committed on chain.</p></div>
  <div class="card"><span class="tag v">Recomputed here</span><h3>Contract scripts</h3><p>Each edition's script is rebuilt from its claimed state and must equal the output the mint transaction created across available sources.</p></div>
  <div class="card"><span class="tag d">By design</span><h3>Nothing to pay the platform</h3><p>The contracts contain no treasury or marketplace fee. Network fees still apply.</p></div>
  <div class="card"><span class="tag n">Not claimed</span><h3>Audited</h3><p>The contracts had automated reviews and on-chain negative testing, not a formal third-party audit. Start small.</p></div>
</div>`;

const studio = `
<div class="hero" style="padding-bottom:8px"><span class="eyebrow">Studio · Visual No-Code Builder &amp; Reliks-VM DSL</span><h1>Design visually or in code. <em>Gate</em> it. Publish it.</h1>
<p>Build generative series visually with no-code layers and sliders, or write High-Level Reliks-Script DSL (<code>.vars</code>, <code>seedrng</code>, <code>bg</code>, <code>for/endfor</code>, <code>if/else/endif</code>, <code>rand</code>), preview patina and optional sales wear, run the determinism gates, and publish your SeriesFactory covenant on chain in one click with Kaspire. Standalone offline studio: <a href="studio.html">studio.html</a>.</p></div>
<div class="row" style="margin:20px 0 14px;flex-wrap:wrap;gap:8px">
  <input id="name" value="my-program" aria-label="Series name" style="max-width:200px" />
  <button class="btn primary" id="mode-visual" type="button">Visual Builder (No-Code)</button>
  <button class="btn" id="mode-code" type="button">Code Editor (DSL / ASM)</button>
  <select id="tpl" aria-label="Template" style="max-width:250px">
    <option value="iso" selected>Isometric city (Code template)</option>
    <option value="dsl_rings">Celestial rings (High-Level DSL)</option>
    <option value="vm_circles">40 circles (Code template)</option>
    <option value="vm_dagcity">DAG-City (Code template)</option>
  </select>
  <button class="btn" id="load" type="button">Load code template</button>
</div>
<details class="proof" style="margin-bottom:14px"><summary><span>High-Level Reliks-Script DSL Quick Reference (compiles directly to RVM\\x01 bytecode)</span></summary>
<div style="padding:8px 18px 14px;font:12px/1.6 var(--mono);color:var(--dim)">
<code>.canvas 1000 1000</code> · <code>.vars I X Y R WR</code> (auto-allocates variable slots) · <code>seedrng</code> (initializes PRNG from serial &amp; lineage) · <code>bg 0x090d16</code> (fills canvas) · <code>set X 100</code> · <code>inc X 5</code> · <code>rand 20 800 st X</code> (random int in [min,max]) · <code>for I 0 40 ... endfor</code> (nestable counted loop) · <code>ld X push 500 lt if ... else ... endif</code> (structured branches without manual labels).
</div></details>
<div class="studio">
  <div>
    <div id="visual-builder" style="display:grid;gap:12px"></div>
    <div id="code-pane" hidden><label class="sr" for="ed">Program code</label><textarea id="ed" class="editor" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off"></textarea></div>
  </div>
  <div style="display:grid;gap:14px;align-content:start">
    <div class="art-wrap" id="prev-box" style="border-radius:14px;overflow:hidden;background:#000"></div>
    <div class="row"><input id="ser" value="1" inputmode="numeric" aria-label="Serial" style="max-width:150px" /><button class="btn" id="go">Render</button><button class="btn" id="rnd">Random serial</button><button class="btn" id="run-gates">Run gates</button></div>
    <div class="row" id="vm-controls">
      <input id="lin" value="0000000000000000000000000000000000000000000000000000000000000000" aria-label="Lineage (64 hex)" placeholder="Lineage (64 hex)" style="font-size:12px" />
      <button class="btn" id="rnd-lin" style="flex:0 0 auto">Random lineage</button>
    </div>
    <div class="row" id="vm-wear-row" style="align-items:center">
      <label for="wr" style="font:12px var(--mono);color:var(--dim);flex:0 0 auto">Sales / Wear: <span id="wv">0</span></label>
      <input id="wr" type="range" min="0" max="255" value="0" style="padding:0" />
      <label style="font:12px var(--mono);color:var(--dim);flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;cursor:pointer"><input id="wear-on" type="checkbox" checked style="width:auto;margin:0" />Enable wear</label>
    </div>
    <div class="card" style="padding:10px 12px">
      <div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <b style="font-size:13px">4×4 Variation Matrix (16x)</b>
        <div class="row" style="gap:6px">
          <select id="matrix-mode" aria-label="Matrix mode" style="max-width:195px;padding:4px 8px;font-size:12px">
            <option value="serial_sweep" selected>Serial Sweep (#1–#16)</option>
            <option value="patina_wear">Patina × Wear (4×4 Lifecycle)</option>
            <option value="random_journey">Collector Journey (16 Varied)</option>
          </select>
          <button class="btn" id="btn-matrix-toggle" type="button" style="padding:4px 10px;font-size:12px">Show 4×4</button>
        </div>
      </div>
      <div id="matrix-box" hidden style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px"></div>
    </div>
    <div class="gate-list" id="gates-out" aria-live="polite"></div>
    <pre class="code" id="hashes"></pre>
    <div class="status-line" id="studio-status" aria-live="polite"></div>
  </div>
</div>
<div class="section-h"><h2>Publish &amp; Export</h2></div>
<div class="cards">
  <div class="card"><h3>1. Publish Series on Chain (Kaspire)</h3>
    <p style="margin-bottom:10px">Deploys a new <code>SeriesFactory</code> covenant with your program baked in. Requires green gates and a connected Kaspire wallet (1 KAS carrier + network fee).</p>
    <div class="field"><label for="artist">Artist key (64 hex or kaspa: address)</label><input id="artist" placeholder="filled from Kaspire when connected" /></div>
    <div class="row"><div class="field"><label for="price">Price (KAS)</label><input id="price" value="1" inputmode="decimal" /></div><div class="field"><label for="roy">Royalty %</label><input id="roy" value="5" inputmode="decimal" /></div><div class="field"><label for="eds">Editions</label><input id="eds" value="8" inputmode="numeric" /></div></div>
    <div class="row" style="margin-top:8px"><button class="btn primary" id="pub-kaspire">Publish on Chain (Kaspire)</button><button class="btn" id="exs">Export series (.json)</button></div>
    <div id="pub-out" style="margin-top:10px"></div>
  </div>
  <div class="card"><h3>2. Export Program / Bytecode</h3><p style="margin-bottom:14px">Exports Reliks-VM bytecode (<code>.hex</code>) and assembly source (<code>.rvm.txt</code>) for <code>cli/reliks-lens.js</code>. Export requires green gates.</p><div class="row"><button class="btn" id="exe">Export bytecode (.hex)</button><button class="btn" id="exsrc">Export source (.rvm.txt)</button></div></div>
  <div class="card"><h3>CLI Alternative</h3><ol class="steps" style="margin-top:6px"><li><span><code>node cli/reliks-lens.js my-program.hex</code></span></li><li><span><code>PROG_FILE=my-program.hex node cli/gen-factory-args.js series.json</code></span></li><li><span>compile with <code>silverc</code>, then deploy</span></li></ol></div>
</div>`;

const protocol = `
<div class="hero" style="padding-bottom:8px"><span class="eyebrow">Protocol</span><h1>What Reliks is, and what it is <em>not</em>.</h1>
<p>Reliks is three Silverscript covenants, the Reliks-VM deterministic bytecode runtime, and a set of verification tools. It is not a custodial marketplace, an indexer or an audited product. This page keeps the claims small enough to check.</p></div>
<div class="section-h"><h2>Claims</h2></div>
<table class="claims"><thead><tr><th style="width:34%">Claim</th><th style="width:16%">Status</th><th>Basis</th></tr></thead><tbody>
<tr><td>The image is a function of (program, serial, lineage, sales)</td><td><span class="tag v">Checked in page</span></td><td>Program hash, image hash and serial are recomputed on load.</td></tr>
<tr><td>The program cannot be swapped after mint</td><td><span class="tag d">Contract</span></td><td>program_hash is part of covenant state and of every successor's script.</td></tr>
<tr><td>Serials are deterministic and ungrindable</td><td><span class="tag d">Contract</span></td><td>Assigned by the lane's monotonic <code>next_serial</code> counter (split into disjoint ranges on fork).</td></tr>
<tr><td>No protocol fee</td><td><span class="tag d">Contract</span></td><td>Primary sale pays the artist 100% of the price. Network fees (about 0.04 KAS per mint) still apply.</td></tr>
<tr><td>Royalties on resale (5%–20%, 0.05 KAS floor)</td><td><span class="tag d">Contract, partly</span></td><td>Enforced on covenant-priced sales (list/buy, atomic bid/sell, escrow accept) with a 5,000,000 sompi mineability floor. <code>transfer</code> is royalty-free by design.</td></tr>
<tr><td>The art survives pruning</td><td><span class="tag n">Not claimed</span></td><td>The hash is anchored on chain and the program bytes ship in the contract script, but pruned nodes may drop old transactions. Keep a copy of the program or provenance bundle.</td></tr>
<tr><td>Audited</td><td><span class="tag n">No</span></td><td>Automated review passes and on-chain exploit/negative suites only. See <code>docs/AUDIT-SUMMARY.md</code>.</td></tr>
<tr><td>Publish, mint, list, buy, bid and transfer in the browser</td><td><span class="tag v">In browser + CLI</span></td><td>1-click series publishing, multi-UTXO minting, fixed-price listings, 2-party atomic bids/offers, and transfers run directly in the browser with Kaspire.</td></tr>
</tbody></table>
<div class="section-h"><h2>Wallet</h2></div>
<div class="cards">
  <div class="card"><span class="tag d">Recommended</span><h3>Kaspire Extension</h3><p>Injected <code>window.kaspire</code> provider. No relay, no QR, no third-party script. It signs wallet inputs (automatically combining up to 4 UTXOs when needed) and broadcasts with <code>pushTx</code>.</p></div>
  <div class="card"><span class="tag d">Android</span><h3>Kaspire Mobile</h3><p>WalletConnect v2, loaded only when you choose it. Connect, sign, and pick one of the one-click wRPC presets in the review step (or your own node) to broadcast.</p></div>
  <div class="card"><span class="tag n">Honest limit</span><h3>Test small</h3><p>The wallet flow follows Kaspire's published API and is tested against mocks. Try it first on a series with editions left, with a low-value wallet.</p></div>
</div>
<div class="section-h"><h2>How a mint works</h2></div>
<ol class="steps">
<li><span>The page rebuilds the live lane state from public chain data and proves it recomputes to the on-chain script.</span></li>
<li><span>It builds one transaction: the lane advances by one, a new edition covenant is created with a 1 KAS carrier, and the artist is paid the price.</span></li>
<li><span>Kaspire shows its own review of that exact transaction and signs only your funding input(s).</span></li>
<li><span>The page checks that the signed transaction still matches what you reviewed, and only then broadcasts.</span></li>
</ol>
<p class="note" style="margin-top:28px">Source, contracts and tests: <a href="https://github.com/weirdtualguy/Reliks" target="_blank" rel="noopener">github.com/weirdtualguy/Reliks</a>. MIT licensed.</p>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Reliks: generative art whose code lives in a Kaspa covenant</title>
<meta name="description" content="Reliks anchors a deterministic generative program inside a Kaspa covenant. Re-render and verify every edition in your browser.">
<meta name="theme-color" content="#06080b">
<link rel="icon" href="${favicon}">
<style>${compactCss(read('web', 'site.css'))}</style>
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
<footer><span>Reliks · MIT · not financial advice, not audited</span><span><a href="https://github.com/weirdtualguy/Reliks" target="_blank" rel="noopener">Source</a> · <a href="https://kaspire.kaslab.space" target="_blank" rel="noopener">Kaspire wallet</a></span></footer>
<dialog id="wallet-dlg" aria-label="Connect wallet"><div class="dlg" id="wallet-body"></div></dialog>
<dialog id="mint-dlg" aria-label="Transaction"><div class="dlg" id="mint-body"></div></dialog>
<div class="toasts" id="toasts" aria-live="polite"></div>
<script type="text/plain" id="qr-src">${compactJs(trimQr(read('web', 'vendor', 'qrcode-generator.js')))}</script>
<script id="rvm-src">var RVM=(function(){var module={exports:{}};
${compactJs(read('vm', 'rvm.js'))}
return module.exports;})();window.RVM=RVM;</script>
<script>var RvmAsm=(function(){var module={exports:{}};
${compactJs(read('web', 'rvm-asm.js'))}
return module.exports;})();window.RvmAsm=RvmAsm;</script>
<script>window.RELIKS_DATA=${json(DATA)};
(function(D){var fe='00'.repeat(3888);D.templates.factory.suffixHex=D.templates.factory.suffixHex.split('__FENG__').join(fe).split('__EDS__').join(D.templates.edition.suffixHex);if(D.bundles&&D.bundles.demo&&D.bundles.demo.series&&!D.bundles.demo.series.program_hex&&D.studio&&D.studio.templates&&D.studio.templates.vm_dagcity){var p0=RvmAsm.assemble(D.studio.templates.vm_dagcity),h0='';for(var j=0;j<p0.length;j++)h0+=(p0[j]<16?'0':'')+p0[j].toString(16);D.bundles.demo.series.program_hex=h0;}})(window.RELIKS_DATA);
window.__qr=function(){if(!window.qrcode){(0,eval)(document.getElementById('qr-src').textContent);}return window.qrcode;};</script>
<script>${compactJs(read('web', 'blake2b.js'))}</script>
<script>${compactJs(read('web', 'reliks-chain.js'))}</script>
<script>${compactJs(read('web', 'kaspire.js'))}</script>
<script>${compactJs(read('web', 'site-app.js'))}</script>
</body>
</html>
`;

fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
const OUT = process.env.RELIKS_OUT || path.join(ROOT, 'docs', 'index.html');
fs.writeFileSync(OUT, html);
console.log(path.relative(ROOT, OUT) + ' written (' + html.length + ' bytes) | no external scripts | anchors verified against engines');
