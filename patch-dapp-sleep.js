const fs = require('fs');
let s = fs.readFileSync('web/index.html', 'utf8');
const old = "if(u)log('  waiting confirmation: live '+u.txId.slice(0,8)+':'+u.index+' != expected '+expectOp);}return null;}";
const neu = "if(u)log('  waiting confirmation: live '+u.txId.slice(0,8)+':'+u.index+' != expected '+expectOp);await new Promise(r=>setTimeout(r,4000));}return null;}";
if (!s.includes(old)) { console.error('pollCell line not found'); process.exit(1); }
fs.writeFileSync('web/index.html', s.split(old).join(neu));
console.log('✅ pollCell now paces its mismatch loop (4 s)');
