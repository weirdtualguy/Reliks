const fs = require('fs');

async function mint() {
  const ledger = JSON.parse(fs.readFileSync('factory-ledger.json', 'utf8'));
  console.log('Factory Covenant ID:', ledger.covenantId);
  
  // Fetch factory UTXO details
  const utxoUrl = `https://kascov.io/data/testnet-10/c/${ledger.covenantId}.json`;
  const utxoResp = await fetch(utxoUrl);
  const utxoData = await utxoResp.json();
  
  const factoryUtxo = utxoData.utxos[0];
  const factoryOutpoint = factoryUtxo.outpoint;
  const factoryValue = factoryUtxo.value;
  
  console.log('Factory UTXO:', factoryOutpoint);
  console.log('Factory value:', factoryValue, 'sompi');
  
  // Fetch wallet UTXOs
  const walletAddr = 'kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';
  const walletUrl = `https://api-tn10.kaspa.org/addresses/${walletAddr}/utxos`;
  const walletResp = await fetch(walletUrl);
  const walletUtxos = await walletResp.json();
  
  const fundingUtxo = walletUtxos[0];
  const fundingOutpoint = fundingUtxo.outpoint;
  const fundingValue = parseInt(fundingUtxo.utxoEntry.amount);
  
  console.log('Funding UTXO:', fundingOutpoint.transactionId, fundingOutpoint.index);
  console.log('Funding value:', fundingValue, 'sompi');
  
  // Transaction structure:
  // Input 0: Factory UTXO (covenant input)
  // Input 1: Wallet UTXO (funding)
  // Output 0: Factory continuation (factoryValue, same covenant_id)
  // Output 1: Edition #0 (100000000 sompi, new covenant lineage)
  // Output 2: Artist payment (100000000 sompi)
  // Output 3: Change (fundingValue - 100000000 - 100000000 - fee)
  
  const artistPayment = 100000000;
  const editionDust = 100000000;
  const fee = 10000;
  const change = fundingValue - artistPayment - editionDust - fee;
  
  console.log('\nTransaction structure:');
  console.log('  Input 0: Factory', factoryOutpoint.transactionId, factoryOutpoint.index);
  console.log('  Input 1: Wallet', fundingOutpoint.transactionId, fundingOutpoint.index);
  console.log('  Output 0: Factory continuation', factoryValue);
  console.log('  Output 1: Edition #0', editionDust);
  console.log('  Output 2: Artist payment', artistPayment);
  console.log('  Output 3: Change', change);
  
  console.log('\n⚠️  kascov /preflight requires a fully signed transaction.');
  console.log('Since kaspa-wasm is broken, we need an alternative.');
  console.log('Options:');
  console.log('1. Use the kascov deploy endpoint with a custom program (not ideal)');
  console.log('2. Write a minimal Rust builder with rusty-kaspa');
  console.log('3. Use a different JS library (kaspa-core-wasm, etc.)');
}

mint().catch(e => console.error('Error:', e));
