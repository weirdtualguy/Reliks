const fs = require('fs');
const p = process.env.HOME + '/opt/silverscript/contracts/Series.sil';
let s = fs.readFileSync(p, 'utf8');
const old = '#[covenant(binding = auth, mode = verification)]';
const neu = '#[covenant(binding = auth, mode = verification, from = 1, to = 2)]';
if (s.indexOf(old) < 0) { console.log('❌ attribute line not found'); process.exit(1); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log('✅ mint → binding=auth, mode=verification, from=1, to=2');
