const ws = new WebSocket('wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json');
const BLOCK = '2927d0dc1cfe739d9948c89025f14b15c22d27a9d3e36c9c8b0d0f2ceb24b6ce';

ws.onopen = () => ws.send(JSON.stringify({
  id: 1, method: 'getBlock', params: { hash: BLOCK, includeTransactions: true }
}));

ws.onmessage = e => {
  const msg = JSON.parse(e.data);
  if (msg.error) { console.log('RPC ERR:', JSON.stringify(msg.error)); ws.close(); return; }
  const r = msg.result || {};
  console.log('result keys:', Object.keys(r));
  const blk = r.block || r;
  console.log('block keys:', Object.keys(blk));
  const txs = blk.transactions || [];
  console.log('tx count:', txs.length);
  if (txs.length) {
    const hit = txs.find(t => JSON.stringify(t).includes('aa2033f7b120'));
    console.log(JSON.stringify(hit || txs[0], null, 2));
  } else {
    console.log('raw result head:', JSON.stringify(r).slice(0, 1500));
  }
  ws.close();
};
ws.onerror = err => console.error('ws error:', err.message);
