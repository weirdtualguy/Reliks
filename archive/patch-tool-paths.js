const fs = require('fs');
const files = ['verify-editions-v8.js', 'gen-reliks-registry-mainnet.js', 'gen-genesis-chunks.js', 'preview-art.js'];
const remaps = {
  "'factory-ledger-v8.json'": "'data/factory-ledger-v8.json'",
  "'edition-abi-v4.json'": "'data/edition-abi-v4.json'",
  "'chunks.json'": "'data/chunks.json'",
  "'genesis-art.html'": "'archive/genesis-art.html'"
};
for (const f of files) {
  if (!fs.existsSync(f)) { console.log('skip (not at root):', f); continue; }
  let s = fs.readFileSync(f, 'utf8');
  for (const [a, b] of Object.entries(remaps)) s = s.split(a).join(b);
  fs.writeFileSync(f, s);
  console.log('✅ paths fixed in', f);
}
