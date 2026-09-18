const endpoints = [
  'wss://wrpc1.kaspa.org',
  'wss://wrpc2.kaspa.org', 
  'ws://seeder1.kaspad.net:18110',
  'wss://electron-2.kaspa.stream/kaspa/mainnet/wrpc/json',
  'ws://seeder2.kaspad.net:18110',
  'wss://vector-2.kaspa.green/kaspa/mainnet/wrpc/json',
  'wss://baryon-1.kaspa.green/kaspa/mainnet/wrpc/json',
  'wss://photon-1.kaspa.red/kaspa/mainnet/wrpc/json',
  'wss://photon-2.kaspa.red/kaspa/mainnet/wrpc/json',
  'wss://seed-1.kaspad.net/kaspa/mainnet/wrpc/json',
  'wss://seed-2.kaspad.net/kaspa/mainnet/wrpc/json',
];

console.log('Testing', endpoints.length, 'wRPC endpoints...\n');

let idx = 0;
const working = [];

const testNext = () => {
  if (idx >= endpoints.length) {
    console.log('\n=== RESULTS ===');
    console.log('Working endpoints:', working.length);
    working.forEach(e => console.log('  ✅', e));
    if (working.length > 0) {
      const fs = require('fs');
      let net = fs.readFileSync('network.js', 'utf8');
      const newWrpc = `wrpc: ${JSON.stringify(working, null, 2).replace(/"/g, "'")}`;
      net = net.replace(/wrpc:\s*\[[\s\S]*?\]/, newWrpc);
      fs.writeFileSync('network.js', net);
      console.log('\n✅ Updated network.js with', working.length, 'working endpoints');
    }
    process.exit(working.length > 0 ? 0 : 1);
  }
  
  const url = endpoints[idx];
  console.log(`[${idx + 1}/${endpoints.length}] ${url}`);
  
  const ws = new (require('ws'))(url, { rejectUnauthorized: false });
  const timeout = setTimeout(() => {
    console.log('  ⏱️  TIMEOUT (8s)');
    ws.terminate();
    idx++;
    testNext();
  }, 8000);
  
  ws.on('open', () => {
    clearTimeout(timeout);
    console.log('  ✅ OPEN');
    working.push(url);
    ws.close();
    idx++;
    testNext();
  });
  
  ws.on('error', (e) => {
    clearTimeout(timeout);
    const msg = e.message || e.code || 'unknown';
    console.log('  ❌ ERROR:', msg);
    idx++;
    testNext();
  });
};

testNext();
