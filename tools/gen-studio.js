// Builds docs/studio.html: self-contained Reliks-VM Studio (assemble, preview, run gates, download bytecode). No network, no external assets.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const safe = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const RvmAsm = require(path.join(ROOT, 'web', 'rvm-asm.js'));
const TEMPLATES = { starter: read('web', 'vm-templates', 'iso.txt'), dsl_rings: read('web', 'vm-templates', 'dsl_rings.txt'), vis_cyber: RvmAsm.compileLayers(RvmAsm.VISUAL_PRESETS.cyber_orbs), vis_mandala: RvmAsm.compileLayers(RvmAsm.VISUAL_PRESETS.solar_mandala), vis_skyline: RvmAsm.compileLayers(RvmAsm.VISUAL_PRESETS.skyline_monoliths), vis_bauhaus: RvmAsm.compileLayers(RvmAsm.VISUAL_PRESETS.bauhaus_blocks), circles: read('web', 'vm-templates', 'starter.txt'), dagcity: read('vm', 'asm-corpus', 'dagcity_clean.txt') };
const body = `<main>
<h1>Reliks-VM Studio</h1>
<p class="small">Write a Reliks-VM program or High-Level Reliks-Script DSL (<code>.vars</code>, <code>seedrng</code>, <code>bg</code>, <code>for/endfor</code>, <code>if/else/endif</code>, <code>rand</code>), preview it, run the multi-serial &amp; patina/wear corner gates, and download the bytecode. Everything runs in your browser; nothing is sent anywhere.</p>
<div class="row"><select id="tpl" aria-label="Template"><option value="starter" selected>Isometric city (starter)</option><option value="dsl_rings">Celestial rings (High-Level DSL)</option><option value="vis_cyber">Cyber Grid &amp; Neon Orbs (Visual Preset)</option><option value="vis_mandala">Solar Mandala &amp; Waves (Visual Preset)</option><option value="vis_skyline">Synthwave Skyline Monoliths (Visual Preset)</option><option value="vis_bauhaus">Bauhaus Geometric (Visual Preset)</option><option value="circles">40 circles (smoke test)</option><option value="dagcity">DAG-City (clean port)</option></select><button class="btn ghost" id="load">Load template</button></div>
<textarea id="ed" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off" aria-label="Assembler source"></textarea>
<div class="row"><label for="ser">Serial</label><input id="ser" value="1" inputmode="numeric"><button class="btn ghost" id="rs">Random</button></div>
<div class="row"><label for="lin">Lineage</label><input id="lin" value="0000000000000000000000000000000000000000000000000000000000000000"><button class="btn ghost" id="rl">Random</button></div>
<div class="row"><label for="wr">Sales <span id="wv">0</span></label><input id="wr" type="range" min="0" max="255" value="0"><label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer"><input id="wear-on" type="checkbox" checked style="width:auto;margin:0">Enable wear</label></div>
<div class="row"><button class="btn" id="go">Run</button><button class="btn ghost" id="gates">Run gates</button><span id="st" class="small">Starting…</span></div>
<img id="img" alt="Rendered artwork">
<div class="row"><label for="matrix-mode">4×4 Matrix</label><select id="matrix-mode"><option value="serial_sweep" selected>Serial Sweep (#1–#16)</option><option value="patina_wear">Patina × Wear (4×4 Lifecycle)</option><option value="random_journey">Collector Journey (16 Varied)</option></select><button class="btn ghost" id="btn-matrix" type="button">Toggle 4×4 Matrix</button></div>
<div id="matrix-box" hidden style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0"></div>
<pre id="info"></pre>
<pre id="gates-out"></pre>
<div class="row"><input id="name" value="my-program" aria-label="File name"><button class="btn" id="dlhex">Download .hex</button><button class="btn ghost" id="dlsrc">Download source</button></div>
<p class="small">The .hex file is the raw program (what the series commits to). Run the full CLI sweep with <code>node cli/reliks-lens.js my-program.hex</code>.</p>
</main>`;
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reliks-VM Studio</title><style>' + read('web', 'studio-vm.css') + '</style></head><body>' + body +
  '<script>window.STUDIO=' + safe(JSON.stringify({ templates: TEMPLATES })) + ';</script>' +
  '<script>' + safe(read('web', 'blake2b.js')) + '</script>' +
  '<script>var RVM=(function(){var module={exports:{}};' + safe(read('vm', 'rvm.js')) + '\nreturn module.exports;})();</script>' +
  '<script>var RvmAsm=(function(){var module={exports:{}};' + safe(read('web', 'rvm-asm.js')) + '\nreturn module.exports;})();</script>' +
  '<script>' + safe(read('web', 'studio-vm-app.js')) + '</script></body></html>';
const OUT = process.env.RELIKS_STUDIO_OUT || path.join(ROOT, 'docs', 'studio.html');
fs.writeFileSync(OUT, html);
console.log(OUT + ' written (' + html.length + ' bytes)');
