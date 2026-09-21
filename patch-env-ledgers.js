const fs = require('fs');
const files = ['deploy-v11.js','mint-v11.js','secondary-v11.js','offer-v4.js','accept-v4.js','verify-render-v10.js','gen-gallery-v10.js','gen-factory-args-v11.js'];
const map = [
  ["'data/factory-ledger-v11.json'", "(process.env.RELIKS_LEDGER || 'data/factory-ledger-v11.json')"],
  ["'data/factory-args-v11.json'", "(process.env.RELIKS_ARGS || 'data/factory-args-v11.json')"],
  ["'data/escrow-ledger-v4.json'", "(process.env.RELIKS_ESCROW || 'data/escrow-ledger-v4.json')"]
];
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8'); let n = 0;
  for (const [a, b] of map) { const c = s.split(a).length - 1; if (c) { s = s.split(a).join(b); n += c; } }
  fs.writeFileSync(f, s);
  console.log(f, '->', n, 'path(s) env-parameterized');
}
