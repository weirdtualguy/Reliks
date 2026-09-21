const fs = require('fs');
const OLD = "if (V.WALLET !== V.p2pkAddress('20' + V.USER + 'ac')) { console.error('WALLET/PRIV mismatch — stale PC_WALLET in env?'); process.exit(1); }";
const NEW = "const RG = (() => { const fs2 = require('fs'); const src = fs2.readFileSync(__dirname + '/web/reliks-gallery-runtime.js', 'utf8'); return new Function('RB2B', 'REG', 'self', src + ';return self.ReliksGallery;')(require('@noble/hashes/blake2b').blake2b, { hrp: require('./network.js').hrp }, {}); })();\nif (V.WALLET !== RG.p2pkAddress('20' + V.USER + 'ac')) { console.error('WALLET/PRIV mismatch — stale PC_WALLET in env?'); process.exit(1); }";
for (const p of ['deploy-v11.js', 'mint-v11.js']) {
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes(OLD)) { console.error(p + ': guard anchor not found'); process.exit(1); }
  s = s.split(OLD).join(NEW);
  fs.writeFileSync(p, s);
  console.log(p + ': guard now uses parity-validated gallery codec');
}
