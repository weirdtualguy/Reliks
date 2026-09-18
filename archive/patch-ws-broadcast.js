const fs = require('fs');

let net = fs.readFileSync('network.js', 'utf8');
net = net.replace(/wrpc:\s*\[[\s\S]*?\]/, "wrpc: [\n    'ws://seeder1.kaspad.net:18110',\n    'ws://seeder2.kaspad.net:18110'\n  ]");
fs.writeFileSync('network.js', net);
console.log('✅ network.js wrpc -> live kaspad seeder nodes (ws://…:18110)');

const WS_IMPL = `async function broadcastWithMsg(rpcTx) {
  let WsCtor;
  try { WsCtor = require('ws'); } catch (e) { WsCtor = WebSocket; }
  return new Promise((resolve) => {
    const tryUrl = (k) => {
      if (k >= N.wrpc.length) { resolve({ txId: null, msg: 'all endpoints failed' }); return; }
      const ws = new WsCtor(N.wrpc[k], { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
      const t = setTimeout(() => { console.log('  wrpc timeout [' + N.wrpc[k] + ']'); ws.terminate(); tryUrl(k + 1); }, 15000);
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction: rpcTx, allowOrphan: true } })));
      ws.on('message', d => { const s = d.toString(); clearTimeout(t); let txId = null, msg = ''; try { const j = JSON.parse(s); txId = (j.params || j.result || {}).transactionId || null; msg = (j.error && j.error.message) || s.substring(0, 240); } catch (e) { msg = s.substring(0, 240); } ws.close(); resolve({ txId, msg }); });
      ws.on('error', (e) => { clearTimeout(t); console.error('  wrpc error [' + N.wrpc[k] + ']:', e.message); tryUrl(k + 1); });
    };
    tryUrl(0);
  });
}`;

function replaceFn(code) {
  const m = code.match(/async\s+function\s+broadcastWithMsg\s*\(/);
  if (!m) return null;
  const brace = code.indexOf('{', m.index);
  let depth = 0, end = -1;
  for (let j = brace; j < code.length; j++) {
    if (code[j] === '{') depth++;
    else if (code[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  if (end === -1) return null;
  return code.slice(0, m.index) + WS_IMPL + code.slice(end + 1);
}

for (const file of ['v7-lib.js', 'offer-lib.js']) {
  let code = fs.readFileSync(file, 'utf8');
  const out = replaceFn(code);
  if (out) { fs.writeFileSync(file, out); console.log('✅', file, 'broadcastWithMsg -> wRPC WebSocket (full v1 fields)'); }
  else console.log('❌ no broadcastWithMsg in', file);
}
