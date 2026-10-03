'use strict';
// Read-only smoke test against the real testnet nodes. No key, no broadcast.
const fs = require('fs'), N = require('../network.js'), L = require('./node-lookup.js');
const A = process.env.PC_WALLET || 'kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';
(async () => {
  const j = JSON.parse(await L.defaultCall(N.wrpc[0], 'getUtxosByAddresses', { addresses: [A] }));
  const es = (j.params || j.result).entries.slice().sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
  const sig = '41' + 'ab'.repeat(64) + '01', lk = L.createNodeLookup({ urls: N.wrpc, address: A });
  console.log('unspent wallet input, tx never sent  -> ' + await lk({ inputs: [{ previousOutpoint: es[0].outpoint, signatureScript: sig }] }) + '   (want absent)');
  const ed = JSON.parse(fs.readFileSync('v13/ledger-marks3-v13.json', 'utf8')).editions[0];
  console.log('sales-3 txid with hint               -> ' + await lk({ inputs: [] }, { txId: ed.txId }) + '   (want mined)');
  console.log('input that is not in the UTXO set    -> ' + await lk({ inputs: [{ previousOutpoint: { transactionId: '00'.repeat(32), index: 0 }, signatureScript: sig }] }) + '   (want unknown)');
})();
