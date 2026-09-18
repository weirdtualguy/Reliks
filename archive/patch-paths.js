const fs = require('fs');
const builders = ['deploy-v8.js', 'mint-v8.js', 'art-commit-v7.js', 'reveal-v5.js', 
                  'secondary-v4.js', 'offer-v2.js', 'seed-ledger-v8.js'];
const remaps = {
  'factory-ledger-v8.json': 'data/factory-ledger-v8.json',
  'factory-ledger-v5.json': 'data/factory-ledger-v5.json',
  'chunks.json':            'data/chunks.json',
  'edition-abi-v4.json':    'data/edition-abi-v4.json',
  'factory-abi-v8.json':    'data/factory-abi-v8.json',
  'offer-abi-v2.json':      'data/offer-abi-v2.json',
  'edition-args-v4.json':   'data/edition-args-v4.json',
  'factory-args-v8.json':   'data/factory-args-v8.json',
  'offer-args-v2.json':     'data/offer-args-v2.json'
};
for (const file of builders) {
  if (!fs.existsSync(file)) continue;
  let s = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const [from, to] of Object.entries(remaps)) {
    if (s.includes("'" + from + "'") || s.includes('"' + from + '"')) {
      s = s.split("'" + from + "'").join("'" + to + "'");
      s = s.split('"' + from + '"').join('"' + to + '"');
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(file, s);
    console.log('✅ patched paths in', file);
  }
}
