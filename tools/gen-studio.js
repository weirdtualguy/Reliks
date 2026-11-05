// Builds docs/studio.html: self-contained Reliks-VM Studio (assemble, preview, download bytecode). No network, no external assets.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const safe = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const TEMPLATES = { starter: read('web', 'vm-templates', 'iso.txt'), circles: read('web', 'vm-templates', 'starter.txt'), dagcity: read('v13', 'vm', 'asm-corpus', 'dagcity_clean.txt') };
const body = `<main>
<h1>Reliks-VM Studio</h1>
<p class="small">Write a Reliks-VM program, preview it, download the bytecode. Everything runs in your browser; nothing is sent anywhere. Reliks-VM spec rev 2 is still a draft. Publishing a series on chain is not done here.</p>
<div class="row"><select id="tpl" aria-label="Template"><option value="starter" selected>Isometric city (starter)</option><option value="circles">40 circles (smoke test)</option><option value="dagcity">DAG-City (clean port)</option></select><button class="btn ghost" id="load">Load template</button></div>
<textarea id="ed" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off" aria-label="Assembler source"></textarea>
<div class="row"><label for="ser">Serial</label><input id="ser" value="1" inputmode="numeric"><button class="btn ghost" id="rs">Random</button></div>
<div class="row"><label for="lin">Lineage</label><input id="lin" value="0000000000000000000000000000000000000000000000000000000000000000"><button class="btn ghost" id="rl">Random</button></div>
<div class="row"><label for="wr">Sales <span id="wv">0</span></label><input id="wr" type="range" min="0" max="255" value="0"></div>
<div class="row"><button class="btn" id="go">Run</button><span id="st" class="small">Starting…</span></div>
<img id="img" alt="Rendered artwork">
<pre id="info"></pre>
<div class="row"><input id="name" value="my-program" aria-label="File name"><button class="btn" id="dlhex">Download .hex</button><button class="btn ghost" id="dlsrc">Download source</button></div>
<p class="small">The .hex file is the raw program (what the series commits to). Check it in Termux with <code>node tools/preview-program.js my-program.hex</code>.</p>
</main>`;
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reliks-VM Studio</title><style>' + read('web', 'studio-vm.css') + '</style></head><body>' + body +
  '<script>window.STUDIO=' + safe(JSON.stringify({ templates: TEMPLATES })) + ';</script>' +
  '<script>' + safe(read('web', 'blake2b.js')) + '</script>' +
  '<script>var RVM=(function(){var module={exports:{}};' + safe(read('v13', 'vm', 'rvm.js')) + '\nreturn module.exports;})();</script>' +
  '<script>var RvmAsm=(function(){var module={exports:{}};' + safe(read('web', 'rvm-asm.js')) + '\nreturn module.exports;})();</script>' +
  '<script>' + safe(read('web', 'studio-vm-app.js')) + '</script></body></html>';
const OUT = process.env.RELIKS_STUDIO_OUT || path.join(ROOT, 'docs', 'studio.html');
fs.writeFileSync(OUT, html);
console.log(OUT + ' written (' + html.length + ' bytes)');
