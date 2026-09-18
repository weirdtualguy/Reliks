const fs = require('fs');
const p = 'web/v5-gallery.html';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('factory state not revealed')) { console.log('already patched'); process.exit(0); }
const old = "    const mPushes = parsePushes(hexToBytes(mintTx.inputs[0].signature_script));\n    const fState = mPushes[mPushes.length - 1].slice(span.offset, span.offset + span.len);\n    const programHashOnChain = bytesToHex(parsePushes(fState)[0]);";
if (!s.includes(old)) { console.error('anchor not found'); process.exit(1); }
const neu = "    const mPushes = parsePushes(hexToBytes(mintTx.inputs[0].signature_script));\n    const fRedeem = mPushes[mPushes.length - 1];\n    if (fRedeem.length !== fC.compiled.bytecode.length) throw new Error('factory state not revealed on-chain yet: input0 of ' + liveU.outpoint.split(':')[0].slice(0, 8) + ' is not a factory spend (series never minted or closed); P2SH hides state until first spend');\n    const fState = fRedeem.slice(span.offset, span.offset + span.len);\n    const programHashOnChain = bytesToHex(parsePushes(fState)[0]);\n    if (programHashOnChain.length !== 64) throw new Error('bad program_hash extraction: ' + programHashOnChain);";
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log('patched web/v5-gallery.html: redeem-length guard on 1b');
