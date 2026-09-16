const fs = require('fs');
let c = fs.readFileSync('src/render3.ts', 'utf8');
if (c.indexOf('const NAME') < 0) {
  c = c.split("const F = JSON.parse(fs.readFileSync(process.argv[2] || 'factory3.json', 'utf8'));")
       .join("const F = JSON.parse(fs.readFileSync(process.argv[2] || 'factory3.json', 'utf8'));\nconst NAME = (process.argv[2] || 'factory3.json').replace('factory', 'bloom').replace('.json', '');");
  c = c.split('bloom3-f${fr}.svg').join('${NAME}-f${fr}.svg');
  fs.writeFileSync('src/render3.ts', c); console.log('✅ render3: output names follow the factory file');
}
let m = fs.readFileSync('src/mint-v2.ts', 'utf8');
m = m.split("const TAG = Buffer.from('42c6a550', 'hex');").join("const TAG = Buffer.from(F.mintTag || '42c6a550', 'hex');");
fs.writeFileSync('src/mint-v2.ts', m);
let e = fs.readFileSync('src/edition-run.ts', 'utf8');
e = e.split("const F2 = JSON.parse(fs.readFileSync('factory2.json', 'utf8'));").join("const FPATH = process.argv[2] || 'factory2.json';\nconst F2 = JSON.parse(fs.readFileSync(FPATH, 'utf8'));");
e = e.split("const F = JSON.parse(fs.readFileSync('factory2.json', 'utf8'));").join("const F = JSON.parse(fs.readFileSync(FPATH, 'utf8'));");
e = e.split("const TAG = Buffer.from('42c6a550', 'hex');").join("const TAG = Buffer.from(F2.mintTag || '42c6a550', 'hex');");
e = e.split("fs.readFileSync('factory2-program.hex', 'utf8')").join("fs.readFileSync(FPATH.replace('.json', '-program.hex'), 'utf8')");
e = e.split("fs.writeFileSync('factory2.json', JSON.stringify(F, null, 1));").join("fs.writeFileSync(FPATH, JSON.stringify(F, null, 1));");
fs.writeFileSync('src/edition-run.ts', e);
console.log('✅ mintTag is now per-factory ledger state; edition-run parameterized: npx ts-node src/edition-run.ts factory4.json');
