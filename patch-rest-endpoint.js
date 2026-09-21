const fs = require('fs');
const p = 'network.js';
let s = fs.readFileSync(p, 'utf8');
const old = "rest: 'https://api-tn10.kaspa.org'";
const neu = "rest: 'https://api-testnet-10.kaspa.org'";  // adjust based on probe results
if (!s.includes(old)) { console.error('REST anchor not found'); process.exit(1); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log('network.js REST endpoint patched');
