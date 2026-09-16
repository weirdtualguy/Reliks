import WebSocket from 'ws';

// wRPC JSON: REST strips computeBudget, so the Toccata budget is committed here.
txJson.transaction.inputs[0].computeBudget = 10;
txJson.transaction.inputs[0].sigOpCount = 0;

const WRPC_URLS = [
  'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json',
  'wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json'
];

let done = false;
function tryNode(i: number): void {
  if (done) return;
  if (i >= WRPC_URLS.length) { console.log('❌ all wRPC nodes failed'); process.exit(1); }
  console.log('\n📡 Connecting ' + WRPC_URLS[i]);
  const ws = new WebSocket(WRPC_URLS[i], {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' }
  });
  const t = setTimeout(() => { console.log('⏱ timeout'); ws.terminate(); tryNode(i + 1); }, 8000);
  ws.on('open', () => {
    console.log('✅ connected, sending submitTransactionRequest (no jsonrpc field)...');
    ws.send(JSON.stringify(
      { id: 1, method: 'submitTransactionRequest',
        params: { transaction: txJson.transaction, allowOrphan: false } },
      (k, v) => (typeof v === 'bigint' ? Number(v) : v)
    ));
  });
  ws.on('message', (d: any) => {
    done = true; clearTimeout(t);
    console.log('📥 Node Response:', d.toString());
    ws.close(); process.exit(0);
  });
  ws.on('error', (e: any) => { clearTimeout(t); console.log('❌ ' + e.message); tryNode(i + 1); });
  ws.on('close', (code: number) => { clearTimeout(t); if (!done && code !== 1000) tryNode(i + 1); });
}
tryNode(0);
