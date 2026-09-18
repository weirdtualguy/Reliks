const L = require('./offer-lib.js');
const CHUNK_DUST = BigInt(process.env.PC_CHUNK_DUST || '100000000');

const { B, hex, H, pushExp, p2sh, sighash, pickUtxo, secp, fs } = L;
(async () => {
  const CH = JSON.parse(fs.readFileSync('data/chunks.json', 'utf8'));
  const buildRedeem = chunkHex => B.concat([pushExp(B.from(chunkHex, 'hex')), B.from([0x75]), pushExp(H(L.USER)), B.from([0xac])]);
  const wIn = await pickUtxo();
  const outs = [{ amount: 10000000n, scriptPublicKey: '20' + L.USER + 'ac' }];
  for (const c of CH.chunks) outs.push({ amount: CHUNK_DUST, scriptPublicKey: p2sh(buildRedeem(c)) });
  outs.push({ amount: wIn.amount - 10000000n - (CHUNK_DUST * 8n) - 3000000n, scriptPublicKey: wIn.spk });
  const sig = '41' + hex(secp.schnorr.signSync(sighash([wIn], outs, 0), L.PRIV)) + '01';
  const tx = { version: 1, inputs: [{ previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sig, sequence: 0, sigOpCount: 0, computeBudget: 10 }], outputs: outs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
  const txId = await L.broadcast(tx);
  if (!txId) throw new Error('art commit broadcast failed');
  const LD = JSON.parse(fs.readFileSync((process.argv[2] || 'factory-ledger-v7.json'), 'utf8'));
  LD.artTxId = txId;
  LD.chunkDust = Number(CHUNK_DUST);
  fs.writeFileSync((process.argv[2] || 'factory-ledger-v7.json'), JSON.stringify(LD, null, 2));
  console.log('ART COMMITTED:', txId, '| chunks at outputs 1..' + CH.chunks.length, '| ledger.artTxId set');
})().catch(e => { console.error(e); process.exit(1); });
