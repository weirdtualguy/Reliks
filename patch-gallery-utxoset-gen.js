const fs = require('fs');
const p = 'gen-gallery-v10.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('hrp: N.hrp')) { console.log('already patched'); process.exit(0); }
s = s.split('rest: N.rest, explorer: N.explorer,').join('rest: N.rest, explorer: N.explorer, hrp: N.hrp,');
s = s.split("assert(RG.blakeHex(RG.utf8(REG.engineSrc)) === ENGINE.engineHashHex, 'engine hash');")
      .join("assert(RG.p2pkAddress('20' + V.USER + 'ac') === V.WALLET, 'bech32 P2PK vector == configured wallet address');\nassert(RG.blakeHex(RG.utf8(REG.engineSrc)) === ENGINE.engineHashHex, 'engine hash');");
s = s.split('lineage authenticated output-by-output against the chain.</div>')
      .join('lineage authenticated output-by-output against the chain. Live (unspent) outputs anchor against the never-pruned UTXO set via bech32 P2SH addresses; spent outputs fall back to archival sources with explicit labeling.</div>');
fs.writeFileSync(p, s);
console.log('patched generator: hrp in REG + bech32 wallet-address parity vector + note');
