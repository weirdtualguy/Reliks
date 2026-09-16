const fs = require('fs');
let c = fs.readFileSync('src/mint-v2.ts', 'utf8');
if (c.indexOf('const FPATH') >= 0) { console.log('already parameterized'); process.exit(0); }
c = c.split('const PRIV =').join("const FPATH = process.argv[2] || 'factory2.json';\nconst PRIV =");
c = c.split("fs.readFileSync('factory2.json', 'utf8')").join("fs.readFileSync(FPATH, 'utf8')");
c = c.split("fs.readFileSync('factory2-program.hex', 'utf8')").join("fs.readFileSync(FPATH.replace('.json', '-program.hex'), 'utf8')");
c = c.split("fs.writeFileSync('factory2.json', JSON.stringify(F, null, 1));").join("fs.writeFileSync(FPATH, JSON.stringify(F, null, 1));");
fs.writeFileSync('src/mint-v2.ts', c);
console.log('✅ mint-v2 parameterized: npx ts-node src/mint-v2.ts [factoryN.json]');
