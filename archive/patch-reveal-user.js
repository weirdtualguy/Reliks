const fs = require('fs');
let code = fs.readFileSync('reveal-v5.js', 'utf8');

const OLD = `  const PRIV = require('./config').PRIV;
  const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';`;

const NEW = `  const V = require('./v8-lib.js');
  const PRIV = V.PRIV;
  const USER = V.USER;`;

if (code.includes(OLD)) {
  code = code.split(OLD).join(NEW);
  fs.writeFileSync('reveal-v5.js', code);
  console.log('✅ reveal-v5.js patched: USER now dynamically imported from v8-lib.js');
} else {
  // Fallback regex just in case formatting differs slightly
  code = code.replace(/const PRIV = require\('\.\/config'\)\.PRIV;\s*const USER = '[0-9a-f]+';/, NEW);
  fs.writeFileSync('reveal-v5.js', code);
  console.log('✅ reveal-v5.js patched via regex fallback');
}
