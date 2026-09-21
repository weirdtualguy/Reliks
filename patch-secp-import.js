const fs = require('fs');
const oldLine = "const { secp256k1: secp } = require('@noble/curves/secp256k1');";
const newLine = "const secp = (() => { try { const s = require('@noble/secp256k1'); if (s.schnorr && s.schnorr.signSync) return s; } catch (e) {} const c = require('@noble/curves/secp256k1'); return { schnorr: { signSync: (m, p) => c.schnorr.sign(m, p) } }; })();";
for (const p of ['deploy-v11.js', 'mint-v11.js']) {
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes(oldLine)) { console.error(p + ': secp import anchor not found'); process.exit(1); }
  s = s.split(oldLine).join(newLine);
  fs.writeFileSync(p, s);
  console.log(p + ': secp import fixed (noble secp256k1 v1 shape, curves fallback)');
}
