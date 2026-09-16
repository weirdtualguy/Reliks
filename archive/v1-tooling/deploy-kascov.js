const fs = require('fs');

async function deploy() {
  const abi = JSON.parse(fs.readFileSync('factory-abi.json', 'utf8'));
  const bytecode = Buffer.from(abi.contracts.SeriesFactory.compiled.bytecode);
  const programHex = bytecode.toString('hex');
  
  console.log('Deploying SeriesFactory via kascov...');
  console.log('Bytecode length:', bytecode.length, 'bytes');
  
  // kascov requires between 1 and 10 TKAS (100,000,000 to 1,000,000,000 sompi)
  const value = 500000000; // 5 TKAS
  
  const payload = {
    program_hex: programHex,
    value: value
  };
  
  let result = null;
  for (let i = 0; i < 5; i++) {
    try {
      console.log(`Attempt ${i + 1}...`);
      const res = await fetch('https://kascov.io/data/testnet-10/deploy', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
          'Origin': 'https://wallet.kaspanet.io'
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const text = await res.text();
        console.log(`  HTTP Failed: ${res.status} ${text}`);
      } else {
        const data = await res.json();
        if (!data.ok) {
          console.log(`  API Error: ${data.error}`);
        } else {
          result = data;
          console.log('✅ Deploy successful!');
          console.log('Response:', JSON.stringify(result, null, 2));
          break;
        }
      }
    } catch (e) {
      console.log(`  Network error:`, e.message);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  
  if (!result) {
    console.error('❌ Deployment failed after retries.');
    process.exit(1);
  }
  
  const covenantId = result.covenant_id || result.covenantId;
  const txId = result.tx_id || result.txId || result.transaction_id;
  
  const ledger = {
    covenantId: covenantId,
    genesisTxId: txId,
    templateHash: Buffer.from(abi.contracts.SeriesFactory.compiled.template_hash).toString('hex'),
    mintTag: abi.contracts.SeriesFactory.entries.mint.dispatch_tag,
    bytecodeLen: bytecode.length
  };
  
  fs.writeFileSync('factory-ledger.json', JSON.stringify(ledger, null, 2));
  console.log('\n✅ Saved deployment details to factory-ledger.json');
}

deploy();
