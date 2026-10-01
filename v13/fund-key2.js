const V=require('../reliks-lib.js'),{feeLoop,pickUtxo,sighash,hex}=V;
const {schnorr}=require('@noble/curves/secp256k1');
const pub=process.env.KEY2_PUB, amt=BigInt(process.argv[2]||'1000000000');
(async()=>{
 const wIn=await pickUtxo();
 const hs=[{txId:wIn.txId,index:wIn.index,sequence:0,spk:wIn.spk,amount:wIn.amount}];
 const inputs=[{previousOutpoint:{transactionId:wIn.txId,index:wIn.index},signatureScript:'',sequence:0,sigOpCount:0,computeBudget:10}];
 const build=fee=>{const outputs=[{amount:amt,scriptPublicKey:'20'+pub+'ac'},{amount:BigInt(wIn.amount)-amt-fee,scriptPublicKey:wIn.spk}];
  inputs[0].signatureScript='41'+hex(schnorr.sign(sighash(hs,outputs,0),V.PRIV))+'01';
  return {version:1,inputs,outputs:outputs.map(o=>({value:Number(o.amount),scriptPublicKey:'0000'+o.scriptPublicKey})),lockTime:0,subnetworkId:'00'.repeat(20),gas:0,payload:'',mass:0};};
 const {txId}=await feeLoop(build,3000000n,{covenantSpend:false}); console.log('FUND TX',txId);
})().catch(e=>{console.error(e);process.exit(1)});
