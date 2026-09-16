const fs = require('fs');
let c = fs.readFileSync('src/series-v4.ts', 'utf8');
if (c.indexOf('Buffer.alloc(568)') < 0) { console.log('✅ already patched or not found'); process.exit(0); }
c = c.split('Buffer.alloc(568)').join('Buffer.alloc(2048)');
fs.writeFileSync('src/series-v4.ts', c);
console.log('✅ series-v4.ts → Buffer.alloc(2048)');
