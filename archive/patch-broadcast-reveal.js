const fs = require('fs');
let code = fs.readFileSync('offer-lib.js', 'utf8');
if (code.includes('API HIDDEN ERROR')) {
  console.log('already patched');
  process.exit(0);
}
const OLD = /if\s*\(\s*r\.ok\s*\)/;
const NEW = "if (!r.ok) { try { const errTxt = await r.text(); console.error('API HIDDEN ERROR [' + r.status + ']:', errTxt.slice(0, 500)); } catch(e){} }\n      if (r.ok)";
if (!OLD.test(code)) {
  console.log('❌ anchor missing: could not find "if (r.ok)" in offer-lib.js');
  process.exit(1);
}
code = code.replace(OLD, NEW);
fs.writeFileSync('offer-lib.js', code);
console.log('✅ patched offer-lib.js to reveal hidden API errors');
