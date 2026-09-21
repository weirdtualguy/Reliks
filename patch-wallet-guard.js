const fs = require('fs');
const GUARD = "if (V.WALLET !== V.p2pkAddress('20' + V.USER + 'ac')) { console.error('WALLET/PRIV mismatch — stale PC_WALLET in env?'); process.exit(1); }\n";
for (const p of ['deploy-v11.js', 'mint-v11.js']) {
  let s = fs.readFileSync(p, 'utf8');
  if (s.includes('WALLET/PRIV mismatch')) { console.log(p, 'guard present'); continue; }
  const anchor = '(async () => {';
  if (!s.includes(anchor)) { console.error(p + ': async anchor not found'); process.exit(1); }
  s = s.split(anchor).join(GUARD + anchor);
  fs.writeFileSync(p, s);
  console.log(p + ': wallet/priv preflight guard added');
}
