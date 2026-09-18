const WS = require('ws');
const candidates = [
  'wss://wrpc.kasia.fyi',
  'wss://wrpc.kasia.fyi/kaspa/mainnet/wrpc/json',
  'ws://seeder2.kaspad.net:17110',
  'ws://seeder2.kaspad.net:18110',
  'wss://seeder2.kaspad.net:18110',
  'ws://seeder1.kaspad.net:18110',
  'wss://api.kaspa.org',
  'wss://kaspa.aspectron.org'
];
let pending = candidates.length;
const alive = [];
for (const url of candidates) {
  const done = (msg) => { console.log(url, '->', msg); if (--pending === 0) { console.log('ALIVE:', JSON.stringify(alive)); process.exit(0); } };
  const t = setTimeout(() => { try { ws.terminate(); } catch (e) {} done('TIMEOUT(8s)'); }, 8000);
  let ws;
  try { ws = new WS(url, { rejectUnauthorized: false, handshakeTimeout: 6000 }); }
  catch (e) { clearTimeout(t); done('THROW ' + e.message); continue; }
  ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'getInfo', params: {} })));
  ws.on('message', d => { clearTimeout(t); alive.push(url); done('OPEN+RPC ' + d.toString().slice(0, 160)); try { ws.close(); } catch (e) {} });
  ws.on('error', e => { clearTimeout(t); done('ERR ' + (e.message || e.code)); });
}
