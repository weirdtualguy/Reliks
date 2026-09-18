const fs = require('fs');
const N = require('./network.js');

console.log('Testing wRPC endpoints from network.js:');
console.log('Endpoints:', JSON.stringify(N.wrpc, null, 2));
console.log('');

let idx = 0;
const testNext = () => {
  if (idx >= N.wrpc.length) {
    console.log('\n=== All endpoints tested ===');
    process.exit(0);
  }
  
  const url = N.wrpc[idx];
  console.log(`\n[${idx + 1}/${N.wrpc.length}] Testing: ${url}`);
  
  const ws = new (require('ws'))(url, { rejectUnauthorized: false });
  const timeout = setTimeout(() => {
    console.log('  ⏱️  TIMEOUT after 10s');
    ws.terminate();
    idx++;
    testNext();
  }, 10000);
  
  ws.on('open', () => {
    clearTimeout(timeout);
    console.log('  ✅ OPEN - WebSocket connected successfully');
    console.log('  Sending getInfo request...');
    ws.send(JSON.stringify({ id: 1, method: 'getInfo', params: {} }));
  });
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log('  📥 Response:', JSON.stringify(msg).substring(0, 200));
      ws.close();
      idx++;
      testNext();
    } catch (e) {
      console.log('  📥 Raw:', data.toString().substring(0, 200));
      ws.close();
      idx++;
      testNext();
    }
  });
  
  ws.on('error', (e) => {
    clearTimeout(timeout);
    console.log('  ❌ ERROR:', e.message);
    if (e.code) console.log('     Code:', e.code);
    idx++;
    testNext();
  });
  
  ws.on('close', (code, reason) => {
    console.log('  🔌 CLOSED: code=' + code + ' reason=' + (reason || 'none'));
  });
};

testNext();
