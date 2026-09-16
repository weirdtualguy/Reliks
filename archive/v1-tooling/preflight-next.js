const fs = require('fs');
const tx = JSON.parse(fs.readFileSync('mint-next-tx.json', 'utf8'));
(async () => {
  const fac = await (await fetch('https://kascov.io/data/testnet-10/c/e37e5868903c20bf67843bc7b1586f4c5bbca301a698c4e73ce51b60bca1854a.json')).json();
  const facUtxo = fac.utxos[0];
  const wOut = tx.inputs[1].previousOutpoint;
  const wUtxos = await (await fetch('https://api-tn10.kaspa.org/addresses/kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd/utxos')).json();
  const w = wUtxos.find(u => u.outpoint.transactionId === wOut.transactionId && u.outpoint.index === wOut.index);
  const utxos = [
    { amount: String(facUtxo.value), scriptPublicKey: '0000' + facUtxo.script_hex,
      covenantId: fac.covenant_id },
    { amount: w.utxoEntry.amount, scriptPublicKey: '0000' + w.utxoEntry.scriptPublicKey.scriptPublicKey }
  ];
  for (const shape of [
    { transaction: tx, utxos },
    { transaction: tx, utxoContext: utxos },
    { ...tx, utxos }
  ]) {
    const r = await (await fetch('https://kascov.io/data/testnet-10/preflight', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(shape)
    })).json();
    console.log('--- shape keys:', Object.keys(shape).join(','));
    console.log(JSON.stringify({ verdict: r.verdict, executed: r.executed, findings: r.findings, note: r.execution_note }, null, 2));
    if (r.executed) break;
  }
})();
