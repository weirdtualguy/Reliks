const fs = require('fs');
let s = fs.readFileSync('web/index.html', 'utf8');
const oldFetch = "      const tx = await (await fetch('https://kascov.io/data/testnet-10/tx/' + txid + '.json')).json();";
const newFetch = "      const tx = await (await fetch('https://api-tn10.kaspa.org/transactions/' + txid)).json();";
if (!s.includes(oldFetch)) { console.error('fetch line not found'); process.exit(1); }
s = s.split(oldFetch).join(newFetch);
fs.writeFileSync('web/index.html', s);
console.log('✅ artFor now pulls full transactions (with sigscripts) from node REST');
