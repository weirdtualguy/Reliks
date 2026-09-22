const fs = require('fs');
const path = require('path');

// 1. Load existing modular components
const blakeSrc = fs.readFileSync(path.join(__dirname, 'web', 'gallery-blake2b.js'), 'utf8');
const walletSrc = fs.readFileSync(path.join(__dirname, 'web', 'studio-wallet.js'), 'utf8');
const studioRuntime = fs.readFileSync(path.join(__dirname, 'web', 'reliks-studio-runtime.js'), 'utf8');

// 2. Define Studio Engine Config (must match gen-studio.js)
const CAP = 32768;
const PRELUDE = `var R=(function(L,serial){
var x=(L[0]^serial)|0,y=L[1]|0,z=L[2]|0,w=L[3]|0;
function rnd(){var t=(x^(x<<11))|0;x=y;y=z;z=w;w=(w^(w>>>19))^(t^(t>>>8));return w>>>0;}
function ri(a,b){return a+(rnd()%(b-a+1));}
function pick(a){return a[rnd()%a.length];}
function chance(p){return rnd()%100<p;}
function hsl(){return 'hsl('+rnd()%360+','+ri(40,90)+'%,'+ri(30,70)+'%)';}
function sin(a){a&=4095;var s=a<2048?1:-1,q=a<2048?a:a-2048,u=q*(2048-q);return s*(16*u*10000/(20971520-4*u)|0);}
function cos(a){return sin(a+1024);}
function dir(a,len){return [cos(a)*len/10000|0,sin(a)*len/10000|0];}
function svg(parts,bg){return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">'+(bg?'<rect width="1000" height="1000" fill="'+bg+'"/>':'')+parts.join('')+'</svg>';}
return {rnd:rnd,ri:ri,pick:pick,chance:chance,hsl:hsl,sin:sin,cos:cos,dir:dir,svg:svg,serial:serial,lanes:L};
})(L,serial);`;

const TEMPLATES = {
  circles: `function reliks(L, serial) {
  var n = R.ri(18, 48), out = [];
  for (var i = 0; i < n; i++) {
    out.push('<circle cx="' + R.ri(0,1000) + '" cy="' + R.ri(0,1000) + '" r="' + R.ri(20,240) + '" fill="' + R.hsl() + '" fill-opacity="0.' + R.ri(30,85) + '"/>');
  }
  return R.svg(out, '#000');
}`,
  flow: `function reliks(L, serial) {
  var out = [], i;
  for (i = 0; i < 700; i++) {
    var x = R.ri(0, 1000), y = R.ri(0, 1000);
    var a = (R.sin(x >> 2) + R.cos(y >> 2)) | 0;
    var d = R.dir(a, R.ri(20, 90));
    out.push('<line x1="' + x + '" y1="' + y + '" x2="' + (x + d[0]) + '" y2="' + (y + d[1]) + '" stroke="' + R.hsl() + '" stroke-width="1" opacity="0.5"/>');
  }
  return R.svg(out, '#0a0b10');
}`,
  blank: `function reliks(L, serial) { return R.svg([], '#000'); }`
};

// 3. External CDNs for WalletConnect & QR
const wcScript = '<script type="module">\nimport SignClient from "https://esm.sh/@walletconnect/sign-client@2.13.0";\nwindow.SignClient = SignClient;\nwindow.dispatchEvent(new Event("signclient-loaded"));\n</' + 'script>';
const qrScript = '<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></' + 'script>';

// 4. Assemble HTML
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reliks // Trustless Generative Art</title>
  ${wcScript}
  ${qrScript}
  <style>
    :root {
      --bg: #0a0b10; --surface: #12141a; --surface-2: #1a1c24;
      --border: #23282e; --text: #e8e6e3; --text-dim: #8a9199;
      --accent: #49c5b1; --accent-glow: rgba(73, 197, 177, 0.15);
      --success: #7fd1ae; --font-ui: 'Inter', system-ui, sans-serif;
      --font-mono: 'JetBrains Mono', ui-monospace, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: var(--font-ui); min-height: 100vh; display: flex; flex-direction: column; }
    
    /* Topbar */
    .topbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 32px; border-bottom: 1px solid var(--border); background: rgba(10, 11, 16, 0.8); backdrop-filter: blur(12px); position: sticky; top: 0; z-index: 100; }
    .logo { display: flex; flex-direction: column; }
    .logo-text { font-size: 20px; font-weight: 800; letter-spacing: 2px; color: var(--accent); }
    .logo-sub { font-size: 10px; color: var(--text-dim); letter-spacing: 1px; text-transform: uppercase; }
    .tabs { display: flex; gap: 8px; }
    .tab-btn { background: transparent; border: 1px solid transparent; color: var(--text-dim); padding: 8px 16px; border-radius: 6px; font-weight: 500; cursor: pointer; transition: all 0.2s; font-family: var(--font-ui); }
    .tab-btn:hover { color: var(--text); background: var(--surface); }
    .tab-btn.active { color: var(--accent); background: var(--accent-glow); border-color: rgba(73, 197, 177, 0.3); }
    .wallet-connect { display: flex; align-items: center; gap: 12px; }
    #wallet-btn { background: var(--accent); color: var(--bg); border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-family: var(--font-ui); }
    #wallet-btn:hover { filter: brightness(1.1); }
    .status-text { font-size: 12px; color: var(--success); font-family: var(--font-mono); }

    /* Main Layout */
    main { flex: 1; padding: 32px; max-width: 1400px; margin: 0 auto; width: 100%; }
    .tab-content { display: none; animation: fadeIn 0.3s ease; }
    .tab-content.active { display: block; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

    /* Gallery */
    .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; }
    .series-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: transform 0.2s, border-color 0.2s; }
    .series-card:hover { transform: translateY(-4px); border-color: var(--accent); }
    .card-art { aspect-ratio: 1/1; background: #000; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid var(--border); }
    .card-art svg { width: 100%; height: 100%; }
    .card-info { padding: 20px; }
    .card-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
    .card-meta { font-size: 12px; color: var(--text-dim); font-family: var(--font-mono); margin-bottom: 16px; word-break: break-all; }
    .card-stats { display: flex; gap: 16px; font-size: 12px; }
    .stat { display: flex; flex-direction: column; }
    .stat-label { color: var(--text-dim); text-transform: uppercase; font-size: 10px; letter-spacing: 1px; }
    .stat-value { color: var(--text); font-weight: 600; }
    .badge { display: inline-block; background: var(--accent-glow); color: var(--success); padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }

    /* Studio */
    .studio-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
    .studio-controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .studio-controls input, .studio-controls select { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 12px; border-radius: 6px; font-family: var(--font-mono); font-size: 12px; }
    .studio-controls button { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; font-family: var(--font-ui); }
    .studio-main { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; height: 75vh; min-height: 600px; }
    #ed { width: 100%; height: 100%; background: var(--bg); color: #d8e6dc; border: 1px solid var(--border); border-radius: 8px; padding: 16px; font-family: var(--font-mono); font-size: 13px; line-height: 1.6; resize: none; outline: none; }
    .preview-pane { display: flex; flex-direction: column; gap: 16px; height: 100%; }
    .preview-controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .preview-controls input { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px; border-radius: 6px; width: 120px; font-family: var(--font-mono); }
    .preview-controls button { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-family: var(--font-ui); }
    #prev { flex: 1; width: 100%; background: #000; border: 1px solid var(--border); border-radius: 8px; min-height: 200px; }
    .export-controls { display: flex; gap: 12px; }
    .btn-primary { flex: 1; background: var(--accent); color: var(--bg); border: none; padding: 12px; border-radius: 6px; font-weight: 600; cursor: pointer; font-family: var(--font-ui); }
    .btn-secondary { flex: 1; background: transparent; border: 1px solid var(--accent); color: var(--accent); padding: 12px; border-radius: 6px; font-weight: 600; cursor: pointer; font-family: var(--font-ui); }
    .studio-logs { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); max-height: 150px; overflow-y: auto; }
    #gates, #hashes { margin-bottom: 8px; white-space: pre-wrap; }
    #status { color: var(--success); font-weight: 600; }

    /* Protocol */
    .protocol-content { max-width: 800px; margin: 0 auto; }
    .protocol-content h2 { font-size: 32px; margin-bottom: 16px; color: var(--accent); }
    .protocol-content p { font-size: 16px; line-height: 1.6; color: var(--text-dim); margin-bottom: 32px; }
    .features-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .feature-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
    .feature-card h3 { font-size: 18px; margin-bottom: 12px; color: var(--text); }
    .feature-card p { font-size: 14px; color: var(--text-dim); line-height: 1.5; margin: 0; }

    @media (max-width: 900px) {
      .studio-main { grid-template-columns: 1fr; height: auto; }
      .features-grid { grid-template-columns: 1fr; }
      .topbar { flex-direction: column; gap: 16px; }
    }
  </style>
</head>
<body>
  <nav class="topbar">
    <div class="logo">
      <span class="logo-text">RELIKS</span>
      <span class="logo-sub">Trustless Generative Art</span>
    </div>
    <div class="tabs">
      <button class="tab-btn active" data-tab="gallery">Gallery</button>
      <button class="tab-btn" data-tab="studio">Studio</button>
      <button class="tab-btn" data-tab="protocol">Protocol</button>
    </div>
    <div class="wallet-connect">
      <button id="wallet-btn">Connect Kaspire</button>
      <span id="wallet-status" class="status-text"></span>
    </div>
  </nav>

  <main>
    <section id="tab-gallery" class="tab-content active">
      <div class="gallery-grid">
        <div class="series-card">
          <div class="card-art">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#0a0b10"/><circle cx="50" cy="50" r="40" fill="none" stroke="#49c5b1" stroke-width="2"/><circle cx="50" cy="50" r="20" fill="none" stroke="#7fd1ae" stroke-width="1"/><path d="M50 10 L50 90 M10 50 L90 50" stroke="#23282e" stroke-width="1"/></svg>
          </div>
          <div class="card-info">
            <span class="badge">Testnet Rehearsal</span>
            <div class="card-title">Series B: Reliks v10</div>
            <div class="card-meta">engine_hash: 8ad0717d...</div>
            <div class="card-stats">
              <div class="stat"><span class="stat-label">Size</span><span class="stat-value">901 B</span></div>
              <div class="stat"><span class="stat-label">Gates</span><span class="stat-value">12/12</span></div>
              <div class="stat"><span class="stat-label">Status</span><span class="stat-value">Anchored</span></div>
            </div>
          </div>
        </div>

        <div class="series-card">
          <div class="card-art">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#0a0b10"/><path d="M50 20 L80 35 L80 65 L50 80 L20 65 L20 35 Z" fill="none" stroke="#49c5b1" stroke-width="1.5"/><path d="M50 20 L50 80 M20 35 L80 65 M80 35 L20 65" stroke="#23282e" stroke-width="1"/><circle cx="50" cy="50" r="5" fill="#7fd1ae"/></svg>
          </div>
          <div class="card-info">
            <span class="badge">Mainnet Candidate</span>
            <div class="card-title">Series C: DAG-City</div>
            <div class="card-meta">engine_hash: 16440384...</div>
            <div class="card-stats">
              <div class="stat"><span class="stat-label">Size</span><span class="stat-value">3.9 KB</span></div>
              <div class="stat"><span class="stat-label">Gates</span><span class="stat-value">12/12</span></div>
              <div class="stat"><span class="stat-label">Market</span><span class="stat-value">Proven</span></div>
            </div>
          </div>
        </div>

        <div class="series-card">
          <div class="card-art">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#000"/><circle cx="30" cy="30" r="25" fill="#ff6b6b" opacity="0.6"/><circle cx="70" cy="40" r="30" fill="#49c5b1" opacity="0.6"/><circle cx="45" cy="70" r="20" fill="#e7dfc8" opacity="0.6"/></svg>
          </div>
          <div class="card-info">
            <span class="badge">Studio Born</span>
            <div class="card-title">Series D: Circles</div>
            <div class="card-meta">engine_hash: fbf13071...</div>
            <div class="card-stats">
              <div class="stat"><span class="stat-label">Size</span><span class="stat-value">1.2 KB</span></div>
              <div class="stat"><span class="stat-label">Gates</span><span class="stat-value">12/12</span></div>
              <div class="stat"><span class="stat-label">Origin</span><span class="stat-value">Browser</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="tab-studio" class="tab-content">
      <div class="studio-header">
        <h2>Artist Studio</h2>
        <div class="studio-controls">
          <input id="name" value="my-engine" placeholder="Series Name">
          <select id="tpl">
            <option value="circles">Circles</option>
            <option value="flow">Flow Field</option>
            <option value="blank">Blank</option>
          </select>
          <button id="load">Load Template</button>
        </div>
      </div>
      <div class="studio-main">
        <div class="editor-pane">
          <textarea id="ed" spellcheck="false"></textarea>
        </div>
        <div class="preview-pane">
          <div class="preview-controls">
            <label>Serial:</label>
            <input id="ser" value="1">
            <button id="go">Render</button>
            <button id="rnd">Random</button>
            <button id="gates">Run Gates</button>
          </div>
          <iframe id="prev" sandbox=""></iframe>
          <div class="export-controls">
            <button id="exe" class="btn-primary">Export Engine (.js)</button>
            <button id="exs" class="btn-secondary">Export Series (.json)</button>
          </div>
          <div class="studio-logs">
            <pre id="gates"></pre>
            <pre id="hashes"></pre>
            <div id="status"></div>
          </div>
        </div>
      </div>
    </section>

    <section id="tab-protocol" class="tab-content">
      <div class="protocol-content">
        <h2>The Reliks Protocol</h2>
        <p>Reliks is a UTXO-native generative art protocol built on Kaspa Toccata L1 Covenants. The artwork's genome is baked directly into the chain state, rendering trustlessly from the ledger without IPFS or centralized servers.</p>
        <div class="features-grid">
          <div class="feature-card">
            <h3>Chain-Anchored Genomes</h3>
            <p>The artwork's engine (~4KB of integer-only JS) is baked directly into the covenant template. No IPFS, no centralized servers. You can't prune the art without pruning mathematics.</p>
          </div>
          <div class="feature-card">
            <h3>Trustless Verification</h3>
            <p>Every edition is recomputed from the chain state. The gallery verifies the 12-step lineage gate suite directly in your browser against the live Kaspa UTXO set.</p>
          </div>
          <div class="feature-card">
            <h3>Deterministic PRNG</h3>
            <p>Seeded xorshift randomness ensures byte-identical SVG output across Node.js and every browser, forever. Verified by dual-field lineage hashes.</p>
          </div>
          <div class="feature-card">
            <h3>Model B Economics</h3>
            <p>On-chain artist royalties (5%), marketplace escrow premiums (1%), and permissionless secondary markets enforced entirely by covenant logic.</p>
          </div>
        </div>
      </div>
    </section>
  </main>

  <script>${blakeSrc}</script>
  <script>${walletSrc}</script>
  <script>
    var PRELUDE = ${JSON.stringify(PRELUDE)};
    var TEMPLATES = ${JSON.stringify(TEMPLATES)};
    var CAP = ${CAP};
    
    // Tab Switching Logic
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });
  </script>
  <script>${studioRuntime}</script>
</body>
</html>`;

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/index.html', html);
console.log('docs/index.html written (' + html.length + ' bytes) | Unified Site Ready');
