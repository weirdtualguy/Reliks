const fs = require('fs');
let c = fs.readFileSync('src/edition-run.ts', 'utf8');
const old = 'for (let k = F.counter; k < F.counter + 5; k++) {';
if (c.indexOf(old) < 0) { console.log('❌ loop line not found'); process.exit(1); }
c = c.split(old).join('const START = F.counter; const END = Math.min(START + 5, 64);\n  for (let k = START; k < END; k++) {');
fs.writeFileSync('src/edition-run.ts', c);
console.log('✅ loop bound frozen at start+5, hard-capped at 64');
