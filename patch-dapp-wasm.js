const fs = require('fs');
let s = fs.readFileSync('web/index.html', 'utf8');
const impLine = "import { Address, PublicKey, initWasm } from 'https://esm.sh/kaspa-wasm@0.14.1';";
const oldBlock = "await initWasm();\nconst pk = new PublicKey(H(priv));\nconst pub = hex(pk.toBytes().slice(1)); // drop 0x02/0x03 prefix for x-only\nconst addr = new Address('kaspatest', pk).toString();";
if (!s.includes(impLine) || !s.includes(oldBlock)) { console.error('markers not found'); process.exit(1); }
const newBlock = `const pub = hex(schnorr.getPublicKey(H(priv)));
let addr = 'pub:' + pub;
try {
  const sdk = await import('https://esm.sh/kaspa-wasm@0.13.0');
  const M = (sdk && sdk.initWasm) ? sdk : (sdk.default || sdk);
  const init = M.initWasm || M.init;
  await init();
  const PK = M.PublicKey, NI = M.NetworkId;
  addr = new PK(pub).toAddress((NI && (NI.Testnet10 || NI.testnet10)) || 'testnet-10').toString();
  log('kaspa-wasm 0.13.0 loaded — address encoded by the official SDK');
} catch (e) { log('⚠ kaspa-wasm unavailable:', e.message, '— pubkey mode (drip still works with pubkey)'); }`;
s = s.split(impLine).join('');
s = s.split(oldBlock).join(newBlock);
fs.writeFileSync('web/index.html', s);
console.log('✅ dApp pinned to kaspa-wasm@0.13.0 with tolerant loader');
