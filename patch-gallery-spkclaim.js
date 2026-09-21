const fs = require('fs');
const p = 'web/reliks-gallery-runtime.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('function spkClaimMatches')) { console.log('already patched'); process.exit(0); }
const oldCheck = "checks.push(['registry self-consistency: edition spk recomputes', editionSpk(ed) === ed.spk]);";
if (!s.includes(oldCheck)) { console.error('check anchor not found'); process.exit(1); }
const helper = "function spkClaimMatches(claim, recomputed) {\n    if (claim === recomputed) return true;\n    try { return new TextDecoder().decode(hexToBytes(claim)) === recomputed; } catch (e) { return false; }\n  }\n  ";
const anchorFn = 'function prevOf(inp) {';
if (!s.includes(anchorFn)) { console.error('fn anchor not found'); process.exit(1); }
s = s.split(oldCheck).join("checks.push(['registry self-consistency: edition spk recomputes (ledger encoding normalized)', spkClaimMatches(ed.spk, editionSpk(ed))]);");
s = s.split(anchorFn).join(helper + anchorFn);
fs.writeFileSync(p, s);
console.log('patched runtime: ledger spk claim normalization (hex-of-hex tolerant)');
