const fs = require('fs');
const p = 'web/reliks-gallery-runtime.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('<svg width="100%" height="100%" ')) { console.log('already patched'); process.exit(0); }
const old = "+ render(String(item.ed.serial)) + '</body></html>';";
if (!s.includes(old)) { console.error('srcdoc anchor not found'); process.exit(1); }
s = s.split(old).join("+ render(String(item.ed.serial)).replace('<svg ', '<svg width=\"100%\" height=\"100%\" ') + '</body></html>';");
fs.writeFileSync(p, s);
console.log('patched runtime: display copy gets explicit svg width/height (anchored bytes unchanged)');
