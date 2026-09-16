const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const abi = JSON.parse(fs.readFileSync('factory-abi-art.json', 'utf8'));
const cn = Object.keys(abi.contracts)[0];
const bytecode = Buffer.from(abi.contracts[cn].compiled.bytecode);
const art = fs.readFileSync('art-program.bin');
const artHash = Buffer.from(blake2b(art, { dkLen: 32 })).toString('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1) Deploy EXACTLY ONCE — never inside a retry loop
  const res = await fetch('https://kascov.io/data/testnet-10/deploy', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' },
    body: JSON.stringify({ program_hex: bytecode.toString('hex'), value: 500000000 })
  });
  const data = await res.json();
  if (!data.ok) { console.error('❌ deploy failed:', JSON.stringify(data)); process.exit(1); }
  const covenantId = data.covenant_id;
  console.log('✅ deployed covenant:', covenantId);

  // 2) Persist the ID IMMEDIATELY, before any indexer query
  const ledger = { covenantId, txId: '', index: 0, counter: 0, editions: [], artProgramHash: artHash };
  fs.writeFileSync('factory-ledger-art.json', JSON.stringify(ledger, null, 2));
  console.log('💾 ledger saved (covenantId persisted)');

  // 3) Poll the indexer for the genesis txid; lag is normal — do NOT redeploy
  for (let i = 0; i < 24; i++) {
    await sleep(5000);
    try {
      const r = await fetch(`https://kascov.io/data/testnet-10/c/${covenantId}.json`);
      if (!r.ok) { console.log(`  indexer lag... (${i + 1}/24)`); continue; }
      const cov = await r.json();
      ledger.txId = cov.genesis_txid;
      fs.writeFileSync('factory-ledger-art.json', JSON.stringify(ledger, null, 2));
      console.log('✅ genesis txid:', ledger.txId);
      console.log('🔗 https://kascov.io/testnet-10/c/' + covenantId);
      return;
    } catch (e) { console.log(`  indexer lag... (${i + 1}/24)`); }
  }
  console.log('⚠️ indexer still lagging. Ledger already has the covenantId; fill txId later with:');
  console.log(`   curl -s https://kascov.io/data/testnet-10/c/${covenantId}.json | jq -r .genesis_txid`);
})();
