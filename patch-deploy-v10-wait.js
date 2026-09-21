const fs = require('fs');
const p = 'deploy-v10.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('await waitForConfirmation(wIn.txId)')) { console.log('already patched'); process.exit(0); }
const anchor = 'const wIn = await pickUtxo();';
if (!s.includes(anchor)) { console.error('anchor not found'); process.exit(1); }
s = s.split(anchor).join(anchor + '\n  await waitForConfirmation(wIn.txId); // F-07: ensure funding parent is confirmed before spending');
fs.writeFileSync(p, s);
console.log('patched deploy-v10.js: waits for funding UTXO parent confirmation');
