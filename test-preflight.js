const fs = require('fs');

async function testPreflight() {
  const ledger = JSON.parse(fs.readFileSync('factory-ledger.json', 'utf8'));
  
  // Fetch factory UTXO
  const utxoUrl = `https://kascov.io/data/testnet-10/c/${ledger.covenantId}.json`;
  const utxoResp = await fetch(utxoUrl);
  const utxoData = await utxoResp.json();
  const factoryUtxo = utxoData.utxos[0];
  
  // Fetch wallet UTXO
  const walletAddr = 'kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';
  const walletUrl = `https://api-tn10.kaspa.org/addresses/${walletAddr}/utxos`;
  const walletResp = await fetch(walletUrl);
  const walletUtxos = await walletResp.json();
  const fundingUtxo = walletUtxos[0];
  
  console.log('Factory UTXO:', factoryUtxo.outpoint, 'value:', factoryUtxo.value);
  console.log('Funding UTXO:', fundingUtxo.outpoint.transactionId, fundingUtxo.outpoint.index);
  console.log('Funding value:', fundingUtxo.utxoEntry.amount);
  
  // kascov /preflight expects a transaction JSON + UTXO context
  // We need to construct this manually based on Kaspa's transaction format
  
  console.log('\n⚠️  kascov /preflight requires a fully signed transaction in Kaspa JSON format.');
  console.log('Since kaspa-wasm is broken, we cannot easily construct this.');
  console.log('\nRecommendation: Contact kascov support or use their web UI to mint manually.');
}

testPreflight().catch(e => console.error('Error:', e));
