const fs = require('fs');
let c = fs.readFileSync('src/mint-edition.ts', 'utf8');
c = c.split("console.log('❌ no tag/combo matched mint layout');")
     .join(`console.log('❌ no tag/combo matched mint layout'); console.log(JSON.stringify(pf.findings, null, 2));`);
fs.writeFileSync('src/mint-edition.ts', c);
console.log('✅ print full findings on failure');
