const fs = require('fs');
const inp = JSON.parse(fs.readFileSync(process.argv[2] || 'overlay.json', 'utf8'));
const led = JSON.parse(fs.readFileSync('editions-ledger.json', 'utf8'));
for (const ed of (inp.overlay || [])) {
  const i = led.findIndex(e => e.covenantId === ed.covenantId);
  if (i >= 0) Object.assign(led[i], ed); else led.push(ed);
}
fs.writeFileSync('editions-ledger.json', JSON.stringify(led, null, 2));
if (inp.fac) {
  const L = JSON.parse(fs.readFileSync('factory-ledger-v3.json', 'utf8'));
  L.counter = Math.max(L.counter, inp.fac.counter);
  for (const ed of (inp.overlay || [])) if (!L.editions.includes(ed.covenantId)) L.editions.push(ed.covenantId);
  fs.writeFileSync('factory-ledger-v3.json', JSON.stringify(L, null, 2));
  console.log('factory counter now', L.counter);
}
console.log('merged', (inp.overlay || []).length, 'overlay editions; ledger total', led.length);
