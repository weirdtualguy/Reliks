const fs = require('fs');
const p = 'gen-gallery-v10.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('aspect-ratio:1/1')) { console.log('already patched'); process.exit(0); }
const old = "iframe.art{width:100%;max-width:520px;height:520px;";
if (!s.includes(old)) { console.error('css anchor not found'); process.exit(1); }
s = s.split(old).join("iframe.art{width:100%;max-width:520px;aspect-ratio:1/1;height:auto;");
fs.writeFileSync(p, s);
console.log('patched generator: iframe.art is square via aspect-ratio');
