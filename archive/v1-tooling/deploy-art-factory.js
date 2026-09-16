const fs = require('fs');
const abi = JSON.parse(fs.readFileSync('factory-abi-art.json', 'utf8'));
const contractName = Object.keys(abi.contracts)[0];
const bytecode = Buffer.from(abi.contracts[contractName].compiled.bytecode);

async function deploy() {
  console.log('Deploying Art Factory via kascov...');
  const payload = { program_hex: bytecode.toString('hex'), value: 500000000 }; // 5 TKAS
  
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch('https://kascov.io/data/testnet-10/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        console.log('✅ Deploy successful!');
        const ledger = {
          covenantId: data.covenant_id,
          txId: data.tx_id || '', // kascov might not return tx_id immediately, we'll fetch it
          index: 0, counter: 0, editions: [],
          artProgramHash: require('@noble/hashes/blake2b').blake2b(bytecode.slice(0, 0), {dkLen:32}).toString('hex') // placeholder
        };
        // Fetch the actual covenant data to get the genesis txId
        const covData = await (await fetch(`https://kascov.io/data/testnet-10/c/${data.covenant_id}.json`)).json();
        ledger.txId = covData.genesis_txid;
        
        fs.writeFileSync('factory-ledger-art.json', JSON.stringify(ledger, null, 2));
        console.log('✅ Saved to factory-ledger-art.json');
        console.log('New Factory Covenant ID:', data.covenant_id);
        return;
      }
    } catch (e) { console.log('Retry...', e.message); }
    await new Promise(r => setTimeout(r, 3000));
  }
}
deploy();
