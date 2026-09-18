const fs = require('fs');
const p = 'mint-art-v5.js';
let s = fs.readFileSync(p, 'utf8');
const anchor = "const s = d.toString(); clearTimeout(t);\n        let txId = null; try";
if (s.includes("console.log('recv:'")) { console.log('already patched'); process.exit(0); }
if (!s.includes(anchor)) { console.error('anchor not found'); process.exit(1); }
const repl = "const s = d.toString(); clearTimeout(t); console.log('recv:', s.substring(0, 500));\n        let txId = null; try";
s = s.split(anchor).join(repl);
fs.writeFileSync(p, s);
console.log('patched mint-art-v5.js to log broadcast response');
