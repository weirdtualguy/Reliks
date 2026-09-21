const V = require('./v8-lib.js');
(async () => {
  const utxos = await (await fetch(V.rest + '/addresses/' + V.WALLET + '/utxos')).json();
  const list = (Array.isArray(utxos) ? utxos : []).filter(x => x.utxoEntry && x.utxoEntry.blockDaaScore);
  const target = list.find(x => x.outpoint.transactionId.startsWith('4682066b'));
  if (target) {
    console.log('TARGET full txId:', target.outpoint.transactionId);
    console.log('  index:', target.outpoint.index, '| amount:', target.utxoEntry.amount, '| daa:', target.utxoEntry.blockDaaScore);
    console.log('  spk:', (target.utxoEntry.scriptPublicKey && target.utxoEntry.scriptPublicKey.scriptPublicKey || '').slice(0, 10) + '...');
    const txRes = await fetch(V.rest + '/transactions/' + target.outpoint.transactionId);
    if (txRes.status === 200) {
      const tx = await txRes.json();
      const out = tx.outputs[target.outpoint.index];
      console.log('PARENT is_accepted:', tx.is_accepted, '| accepting_block:', tx.accepting_block_hash);
      console.log('  output[' + target.outpoint.index + '] value:', out && out.value, '| spk:', out && (out.script_public_key || '').slice(0, 10) + '...');
    } else { console.log('PARENT tx fetch status:', txRes.status); }
  } else { console.log('4682066b UTXO not in current set. confirmed utxos:', list.length); }
})().catch(e => console.error('ERR', e.message));
