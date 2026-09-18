const fs = require('fs');
let s = fs.readFileSync('build-gallery.js', 'utf8');
const oldRead = "fs.existsSync('factory-ledger-art.json') ? 'factory-ledger-art.json' : 'archive/v1-ledgers/factory-ledger-art.json'";
if (s.includes(oldRead)) s = s.split(oldRead).join("'factory-ledger-v2.json'");
const oldFilter = 'const factoryEditions = editions.filter(e => e.factory_covid === factory.covenantId);';
if (s.includes(oldFilter)) s = s.split(oldFilter).join('const factoryEditions = editions.slice();');
fs.writeFileSync('build-gallery.js', s);
console.log('✅ build-gallery.js now renders all editions with the v2 factory header');
