const fs = require('fs');
let s = fs.readFileSync('offer-lib.js', 'utf8');
if (!s.includes('NET: N.NET')) {
  s = s.replace(/module\.exports\s*=\s*\{/, 'module.exports = { NET: N.NET, rest: N.rest, kascov: N.kascov, hrp: N.hrp, label: N.label, ');
  fs.writeFileSync('offer-lib.js', s);
  console.log('patched offer-lib.js exports');
} else {
  console.log('offer-lib.js exports already patched');
}
