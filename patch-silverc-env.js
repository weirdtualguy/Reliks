const fs = require('fs');
const p = 'update-factory-edition-template.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('process.env.SILVERC')) { console.log('already supports SILVERC'); process.exit(0); }
s = s.split('execSync(`silverc ').join('execSync(`${process.env.SILVERC || \'silverc\'} ');
fs.writeFileSync(p, s);
console.log('update script now honors SILVERC env override');
