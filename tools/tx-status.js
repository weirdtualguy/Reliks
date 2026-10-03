// Usage: node tools/tx-status.js <txid> [wallet]. Read-only (no key): asks the testnet nodes and your wallet UTXO set what happened to a tx.
const WS = require('ws'), N = require('../network.js');
const txid = process.argv[2];
if (!/^[0-9a-f]{64}$/.test(txid || '')) { console.error('usage: node tools/tx-status.js <txid> [wallet]'); process.exit(1); }
const WALLET = process.argv[3] || process.env.PC_WALLET || 'kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';
const call = (u, method, params) => new Promise(r => { const w = new WS(u); const t = setTimeout(() => { w.terminate(); r('TIMEOUT'); }, 15000); w.on('open', () => w.send(JSON.stringify({ id: 1, method, params }))); w.on('message', d => { clearTimeout(t); w.close(); r(d.toString()); }); w.on('error', x => { clearTimeout(t); r('ERR ' + x.message); }); });
(async () => {
  let inPool = false, dag = null;
  for (const u of N.wrpc) {
    const m = await call(u, 'getMempoolEntry', { transactionId: txid, includeOrphanPool: true, filterTransactionPool: false });
    const nf = /not found/i.test(m);
    console.log(u.slice(6, 24), 'mempool:', nf ? 'not found' : m.slice(0, 160));
    if (!nf && !/^TIMEOUT|^ERR|"error"/.test(m)) inPool = true;
    if (dag === null) { try { const j = JSON.parse(await call(u, 'getBlockDagInfo', {})); dag = Number((j.params || j.result || j).virtualDaaScore); } catch (e) {} }
  }
  const wu = await (await fetch(N.rest + '/addresses/' + WALLET + '/utxos')).json();
  const mine = Array.isArray(wu) ? wu.filter(u => u.outpoint.transactionId === txid) : [];
  mine.forEach(u => console.log('wallet output', u.outpoint.index, Number(u.utxoEntry.amount) / 1e8, 'TKAS | daa', u.utxoEntry.blockDaaScore));
  if (mine.length) { const d = Number(mine[0].utxoEntry.blockDaaScore); console.log('VERDICT: MINED' + (dag ? ' (about ' + Math.round((dag - d) / 10 / 60) + ' min ago, estimated at 10 DAA/s)' : '')); }
  else if (inPool) console.log('VERDICT: IN MEMPOOL. Wait. Do NOT resubmit or send another tx spending the same outputs.');
  else console.log('VERDICT: NOT FOUND in the node mempools or your wallet UTXO set (dropped, never accepted, or it has no output to your wallet).');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
