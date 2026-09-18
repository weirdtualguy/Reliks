const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.js') && f !== 'config.js' && f !== 'patch-keys.js');
const OLD_KEY = "const PRIV = 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';";
const OLD_KEY_ENV = "const PRIV = process.env.PC_PRIV || 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';";
const OLD_KEY_LOWER = "const priv = 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';";
const NEW_KEY = "const PRIV = require('./config').PRIV;";
const NEW_KEY_LOWER = "const priv = require('./config').PRIV;";

let patched = 0;
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  let changed = false;
  if (s.includes(OLD_KEY)) { s = s.split(OLD_KEY).join(NEW_KEY); changed = true; }
  if (s.includes(OLD_KEY_ENV)) { s = s.split(OLD_KEY_ENV).join(NEW_KEY); changed = true; }
  if (s.includes(OLD_KEY_LOWER)) { s = s.split(OLD_KEY_LOWER).join(NEW_KEY_LOWER); changed = true; }
  if (changed) {
    fs.writeFileSync(f, s);
    console.log('patched', f);
    patched++;
  }
}
console.log('Total patched:', patched);
