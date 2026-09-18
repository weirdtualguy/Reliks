const fs = require('fs');
let s = fs.readFileSync('art-commit-v7.js', 'utf8');
if (!s.includes('process.argv[2]')) {
  s = s.split("'factory-ledger-v7.json'").join("(process.argv[2] || 'factory-ledger-v7.json')");
}
if (!s.includes('chunkDust')) {
  s = s.replace(/fs\.writeFileSync\(([^,]+), JSON\.stringify\(LD, null, 2\)\);/, m => "LD.chunkDust = Number(CHUNK_DUST);\n  " + m);
}
fs.writeFileSync('art-commit-v7.js', s);
console.log('art-commit patched: argv ledger path + chunkDust pinned into ledger');
