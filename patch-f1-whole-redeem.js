const fs = require('fs');
const p = 'verify-render-v10.js';
let s = fs.readFileSync(p, 'utf8');
const old = "const engineInRedeem_f1 = mintRedeem_f1.length > 0 ? mintRedeem_f1.slice(F.prefix.length, mintRedeem_f1.length - F.suffix.length).includes(Buffer.from(ENGINE.ENGINE_SRC, 'utf8')) : false;";
const neu = "const engineInRedeem_f1 = mintRedeem_f1.length > 0 ? mintRedeem_f1.includes(Buffer.from(ENGINE.ENGINE_SRC, 'utf8')) : false;";
if (!s.includes(old)) { console.error('F1 engine slice anchor not found'); process.exit(1); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log('F1 gate now checks ENGINE_SRC containment in the FULL redeem (engine lives in template bytecode, not the state span)');
