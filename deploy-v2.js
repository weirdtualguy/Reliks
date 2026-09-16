const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const abi = JSON.parse(fs.readFileSync('factory-abi-v2.json', 'utf8'));
const bytecode = Buffer.from(abi.contracts[Object.keys(abi.contracts)[0]].compiled.bytecode);
const artHash = Buffer.from(blake2b(fs.readFileSync('art-program.bin'), { dkLen: 32 })).toString('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const res = await fetch('https://kascov.io/data/testnet-10/deploy', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' },
    body: JSON.stringify({ program_hex: bytecode.toString('hex'), value: 500000000 })
  });
  const data = await res.json();
  if (data.ok !== true) { console.error('❌ deploy failed:', JSON.stringify(data)); process.exit(1); }
  const ledger = { covenantId: data.covenant_id, txId: '', index: 0, counter: 0, editions: [], artProgramHash: artHash };
  fs.writeFileSync('factory-ledger-v2.json', JSON.stringify(ledger, null, 2));
  console.log('✅ deployed v2 factory:', ledger.covenantId, '(ledger saved)');
  for (let i = 0; i < 24; i++) {
    await sleep(5000);
    try {
      const r = await fetch('https://kascov.io/data/testnet-10/c/' + ledger.covenantId + '.json');
      if (!r.ok) { console.log('  indexer lag... (' + (i + 1) + '/24)'); continue; }
      ledger.txId = (await r.json()).genesis_txid;
      fs.writeFileSync('factory-ledger-v2.json', JSON.stringify(ledger, null, 2));
      console.log('✅ genesis txid:', ledger.txId);
      return;
    } catch (e) { console.log('  indexer lag... (' + (i + 1) + '/24)'); }
  }
  console.log('⚠️ still lagging; fill txId later via /c/<id>.json');
})();
