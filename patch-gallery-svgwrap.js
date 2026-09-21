const fs = require('fs');
const p = 'web/reliks-gallery-runtime.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('SVG_WRAP')) { console.log('already patched'); process.exit(0); }
const old = "frame.srcdoc = render(String(item.ed.serial));";
if (!s.includes(old)) { console.error('srcdoc anchor not found'); process.exit(1); }
const neu = "frame.srcdoc = '<!doctype html><html><head><meta charset=\"utf-8\"><style>html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}svg{display:block;width:100vw;height:100vh}</style></head><body><!-- SVG_WRAP -->' + render(String(item.ed.serial)) + '</body></html>';";
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log('patched runtime: srcdoc wrapper gives viewBox-only SVG an explicit viewport');
