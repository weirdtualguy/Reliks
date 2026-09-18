const s = require("@noble/secp256k1");
const c = require("crypto");
s.utils.sha256Sync = (...m) => { const h = c.createHash("sha256"); m.forEach(b => h.update(b)); return h.digest(); };
const p = s.utils.randomPrivateKey();
console.log(Buffer.from(s.schnorr.getPublicKey(p)).toString("hex"));
console.log(Buffer.from(p).toString("hex"));
