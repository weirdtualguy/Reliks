const fs = require('fs');
let s = fs.readFileSync('offer-v2.js', 'utf8');
const S1 = "    function build(txFee) {\n      const outputs = [{ amount: BigInt(of.amount) - txFee, scriptPublicKey: '20' + of.offerer + 'ac' }];";
const S1N = "    const wIn = await pickUtxo();\n    const escIn = { txId: of.txId, index: of.index, sequence: of.expireAge, spk: V.p2sh(ofRedeem(of)), amount: BigInt(of.amount) };\n    function build(txFee) {\n      const outputs = [\n        { amount: BigInt(of.amount), scriptPublicKey: '20' + of.offerer + 'ac' },\n        { amount: wIn.amount - txFee, scriptPublicKey: wIn.spk }\n      ];";
const S2 = "return { version: 1, inputs: [{ previousOutpoint: { transactionId: of.txId, index: of.index }, signatureScript: hex(ss), sequence: of.expireAge, sigOpCount: 0, computeBudget: 50 }], outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };";
const S2N = "const sigW = '41' + hex(secp.schnorr.signSync(sighash([escIn, wIn], outputs, 1), V.PRIV)) + '01';\n      return { version: 1, inputs: [\n        { previousOutpoint: { transactionId: escIn.txId, index: escIn.index }, signatureScript: hex(ss), sequence: escIn.sequence, sigOpCount: 0, computeBudget: 50 },\n        { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sigW, sequence: 0, sigOpCount: 0, computeBudget: 10 }\n      ], outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };";
if (!s.includes(S1) || !s.includes(S2)) { console.log('❌ expire anchors missing'); process.exit(1); }
s = s.split(S1).join(S1N).split(S2).join(S2N);
fs.writeFileSync('offer-v2.js', s);
console.log('✅ expire now funds fee from wallet input; refund == full escrow value');

let v = fs.readFileSync('verify-editions-v8.js', 'utf8');
if (v.includes('indexOf(\'aa20\')')) { console.log('skip: verifier already fixed'); }
else {
  v = v.split("live.slice(8, 72)").join("(live.indexOf('aa20') >= 0 ? live.slice(live.indexOf('aa20') + 4, live.indexOf('aa20') + 68) : live.slice(4, 68))");
  fs.writeFileSync('verify-editions-v8.js', v);
  console.log('✅ verifier hash extraction fixed (REST omits version prefix)');
}
