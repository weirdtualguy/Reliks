const fs = require('fs');

// 1. Patch offer-lib.js to bypass Termux CA certificate issues
let offer = fs.readFileSync('offer-lib.js', 'utf8');
if (!offer.includes('rejectUnauthorized: false')) {
  offer = offer.replace(
    /new WebSocket\((urls\[k\]|N\.wrpc\[k\]), \{ headers:/g,
    "new WebSocket($1, { rejectUnauthorized: false, headers:"
  );
  fs.writeFileSync('offer-lib.js', offer);
  console.log('✅ offer-lib.js patched: added rejectUnauthorized: false for Termux TLS');
} else {
  console.log('skip: offer-lib.js already has rejectUnauthorized');
}

// 2. Expand network.js wRPC endpoints
let net = fs.readFileSync('network.js', 'utf8');
const newEndpoints = `  wrpc: [
    'wss://wrpc1.kaspa.org',
    'ws://seeder1.kaspad.net:18110',
    'ws://seeder2.kaspad.net:18110',
    'wss://baryon-1.kaspa.green/kaspa/mainnet/wrpc/json',
    'wss://photon-1.kaspa.red/kaspa/mainnet/wrpc/json'
  ]`;
if (net.match(/wrpc:\s*\[[^\]]*\]/)) {
  net = net.replace(/wrpc:\s*\[[^\]]*\]/, newEndpoints);
  fs.writeFileSync('network.js', net);
  console.log('✅ network.js patched: expanded wRPC endpoints');
} else {
  console.log('⚠️ could not find wrpc array in network.js to expand');
}
