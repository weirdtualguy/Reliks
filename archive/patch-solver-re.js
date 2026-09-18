const fs = require('fs');
let s = fs.readFileSync('solve-bech32-v3.js', 'utf8');
const old = '")\\s*,\\s*"([^"]+)"\\)/g';
const neu = '")\\)\\s*,\\s*"([^"]+)"\\)/g';
if (!s.includes(old)) { console.error('pattern not found'); process.exit(1); }
s = s.split(old).join(neu);
const guardOld = "console.log('parsed vectors:', vecs.length);";
const guardNew = "console.log('parsed vectors:', vecs.length);\nif (!vecs.length) { const i = src.indexOf('Address::new'); console.log('DEBUG:', JSON.stringify(src.slice(i, i + 300))); process.exit(1); }";
s = s.split(guardOld).join(guardNew);
fs.writeFileSync('solve-bech32-v3.js', s);
console.log('✅ regex fixed: payload ) then , "addr"');
