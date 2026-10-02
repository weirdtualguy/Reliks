// Smallest real testnet transaction: send your largest confirmed UTXO back to your own address (costs only the fee).
if ((process.env.PC_NET || 'testnet') !== 'testnet') { console.error('testnet only'); process.exit(1); }
const V = require('../reliks-lib.js');
const { feeLoop, waitForConfirmation, pickUtxo, sighash, hex } = V;
const { schnorr } = require('@noble/curves/secp256k1');
const sign = (m, p) => schnorr.sign(m, p);
const rpc = (inputs, outputs) => ({ version: 1, inputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
(async () => {
  const wIn = await pickUtxo();
  console.log('spending', wIn.txId.slice(0, 10) + '...:' + wIn.index, '|', Number(wIn.amount) / 1e8, 'TKAS -> back to', V.WALLET.slice(0, 20) + '...');
  const hsInputs = [{ txId: wIn.txId, index: wIn.index, sequence: 0, spk: wIn.spk, amount: wIn.amount }];
  const inputs = [{ previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 10 }];
  function build(fee) {
    const outputs = [{ amount: BigInt(wIn.amount) - fee, scriptPublicKey: wIn.spk }];
    inputs[0].signatureScript = '41' + hex(sign(sighash(hsInputs, outputs, 0), V.PRIV)) + '01';
    return rpc(inputs, outputs);
  }
  const { txId, fee } = await feeLoop(build);
  await waitForConfirmation(txId, 600000);
  console.log('SELF-SEND CONFIRMED:', txId, '| fee', fee.toString(), 'sompi');
  console.log('https://kascov.io/testnet-10/tx/' + txId);
})().catch(e => { console.error(e); process.exit(1); });
