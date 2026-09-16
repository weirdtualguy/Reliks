const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const { 
  RpcClient, NetworkId, PrivateKey, Address, 
  createTransactions, Signer, ScriptPublicKey, TransactionOutput,
  Transaction, TransactionInput, TransactionOutpoint, UtxoEntry
} = require('kaspa-wasm');

async function main() {
  console.log('Connecting to Testnet-10...');
  const rpc = new RpcClient({ networkId: NetworkId.Testnet10 });
  await rpc.connect();

  const abi = JSON.parse(fs.readFileSync('factory-abi.json', 'utf8'));
  const bytecode = Buffer.from(abi.contracts.SeriesFactory.compiled.bytecode);

  // 1. Compute P2SH script: OP_BLAKE2B (0xaa) OP_DATA_32 (0x20) <hash> OP_EQUAL (0x87)
  const redeemHash = blake2b(bytecode, { dkLen: 32 });
  const p2shScript = Buffer.concat([Buffer.from([0xaa, 0x20]), redeemHash, Buffer.from([0x87])]);
  const factorySpk = new ScriptPublicKey(0, p2shScript);

  // 2. Fetch UTXOs
  const addr = Address.fromString('kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd');
  const utxos = await rpc.getUtxosByAddresses([addr]);
  if (!utxos.length) throw new Error('No UTXOs found');
  
  const fundingUtxo = utxos[0];
  console.log('Using UTXO:', fundingUtxo.outpoint.transactionId, fundingUtxo.outpoint.index);

  // 3. Compute Genesis Covenant ID (KIP-20 Section 3.2)
  function computeGenesisCovenantId(txId, outpointIndex, authOutputs) {
    const personal = Buffer.concat([Buffer.from("CovenantID"), Buffer.alloc(6)]);
    const hasher = blake2b.create({ dkLen: 32, personalization: personal });
    hasher.update(Buffer.from(txId.replace('0x',''), 'hex'));
    const idxBuf = Buffer.alloc(4); idxBuf.writeUInt32LE(outpointIndex); hasher.update(idxBuf);
    const lenBuf = Buffer.alloc(8); lenBuf.writeBigUInt64LE(BigInt(authOutputs.length)); hasher.update(lenBuf);
    for (const out of authOutputs) {
      const outIdx = Buffer.alloc(4); outIdx.writeUInt32LE(out.index); hasher.update(outIdx);
      const val = Buffer.alloc(8); val.writeBigUInt64LE(BigInt(out.value)); hasher.update(val);
      const ver = Buffer.alloc(2); ver.writeUInt16LE(out.spk.version); hasher.update(ver);
      const scriptLen = Buffer.alloc(8); scriptLen.writeBigUInt64LE(BigInt(out.spk.script.length)); hasher.update(scriptLen);
      hasher.update(out.spk.script);
    }
    return hasher.digest();
  }

  const factoryValue = 10000000n; // 0.1 KAS for the factory cell
  const factoryOut = new TransactionOutput(factoryValue, factorySpk);
  
  // Compute the covenant ID for the factory output
  const covId = computeGenesisCovenantId(
    fundingUtxo.outpoint.transactionId, 
    fundingUtxo.outpoint.index, 
    [{ index: 0, value: factoryValue, spk: factorySpk }]
  );
  console.log('Factory Covenant ID:', Buffer.from(covId).toString('hex'));

  // 4. Build Transaction
  // Note: kaspa-wasm createTransactions may not expose the covenant binding field directly.
  // If it fails, we will pivot to a raw transaction builder or Rust deployer.
  const privKey = new PrivateKey('ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3');
  
  const { transactions } = await createTransactions({
    entries: [fundingUtxo],
    outputs: [factoryOut],
    changeAddress: addr,
    priorityFee: 10000n,
    signer: new Signer([privKey])
  });

  const tx = transactions[0];
  console.log('Transaction ID:', tx.id);
  console.log('Submitting to network...');
  
  const submitResult = await rpc.submitTransaction(tx, false);
  console.log('✅ Factory deployed successfully!');
  console.log('TxId:', submitResult.transactionId);
  console.log('Covenant ID:', Buffer.from(covId).toString('hex'));
  
  // Save to ledger
  const ledger = {
    covenantId: Buffer.from(covId).toString('hex'),
    genesisTxId: submitResult.transactionId,
    factoryOutpoint: { txId: submitResult.transactionId, index: 0 },
    templateHash: Buffer.from(abi.contracts.SeriesFactory.compiled.template_hash).toString('hex'),
    mintTag: '7fd2c8c6'
  };
  fs.writeFileSync('factory-ledger.json', JSON.stringify(ledger, null, 2));
  console.log('✅ Saved to factory-ledger.json');
  
  await rpc.disconnect();
}

main().catch(e => { console.error('❌ Deployment failed:', e); process.exit(1); });
