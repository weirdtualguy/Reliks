'use strict';
// Generate a FRESH mainnet key ON THIS DEVICE ONLY (Termux).
// Never paste the mainnet key, or env-pass it, into any agent sandbox or
// chat — it lives only on the device, in ~/.reliks-mainnet.env (0600).
// Usage: node tools/gen-mainnet-key.js [--force]
// Prints ONLY the x-only pubkey + the address (never the private key).
// Fund the printed address with ~10 KAS, then load the env file:
//   set -a; . ~/.reliks-mainnet.env; set +a
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { secp256k1 } = require('@noble/curves/secp256k1');
const { encodeP2PK } = require('../lib/bech32-kaspa.js');
const ENV_FILE = path.join(os.homedir(), '.reliks-mainnet.env');
if (fs.existsSync(ENV_FILE) && !process.argv.includes('--force')) {
  console.error('REFUSE: ' + ENV_FILE + ' already exists — refusing to overwrite a live key.');
  console.error('Delete it yourself, or re-run with --force if you are sure it holds no funds.');
  process.exit(1);
}
let priv, pub;
for (let i = 0; i < 10; i++) {
  try { priv = crypto.randomBytes(32); pub = Buffer.from(secp256k1.getPublicKey(priv, true)).subarray(1, 33).toString('hex'); break; }
  catch (e) { if (i === 9) throw e; }
}
const addr = encodeP2PK('kaspa', pub);
fs.writeFileSync(ENV_FILE, 'PC_NET=mainnet\nPC_PRIV=' + priv.toString('hex') + '\nPC_WALLET=' + addr + '\n', { mode: 0o600 });
console.log('PUBKEY (x-only): ' + pub);
console.log('ADDRESS (fund this with ~10 KAS): ' + addr);
console.log('Wrote ' + ENV_FILE + ' (0600). The private key was NOT printed — it lives only in that file.');
