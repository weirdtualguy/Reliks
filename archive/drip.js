const { blake2b } = require('@noble/hashes/blake2b');
const secp = require('@noble/secp256k1');
const crypto = require('crypto');
const WebSocket = require('ws');
secp.utils.sha256Sync = (...m) => { const h = crypto.createHash('sha256'); m.forEach(b => h.update(b)); return h.digest(); };
const B = Buffer, hex = b => B.from(b).toString('hex'), H = s => B.from(s, 'hex');
const le16=n=>{const b=B.alloc(2);b.writeUInt16LE(n);return b;},le32=n=>{const b=B.alloc(4);b.writeUInt32LE(n);return b;},le64=n=>{const b=B.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const SK=B.from('TransactionSigningHash','utf8'),Z32=B.alloc(32,0);
const Kh=d=>B.from(blake2b(Uint8Array.from(d),{dkLen:32,key:Uint8Array.from(SK)}));
const u8=v=>B.from([v&0xff]),vb=b=>B.concat([le64(b.length),b]);
const sighash=(ins,outs,i)=>{const x=ins[i];
  const poh=Kh(B.concat(ins.map(y=>B.concat([H(y.txId),le32(y.index)]))));
  const seh=Kh(B.concat(ins.map(y=>le64(y.sequence||0))));
  const oh=Kh(B.concat(outs.map(o=>B.concat([le64(o.amount),le16(0),vb(H(o.scriptPublicKey)),u8(0)]))));
  return Kh(B.concat([le16(1),poh,seh,H(x.txId),le32(x.index),le16(0),vb(H(x.spk)),le64(x.amount),le64(x.sequence),oh,le64(0),H('00'.repeat(20)),le64(0),Z32,u8(1)]));};
const PRIV = require('./config').PRIV;
const USER='33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const WALLET='kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';
(async()=>{
  const [pub, kas] = process.argv.slice(2);
  if(!pub||!kas||pub.length!==64){ console.log('usage: node drip.js <64-char-pubkey-hex> <KAS>'); process.exit(1); }
  const spkD = '20'+pub+'ac';
  const amt = BigInt(Math.round(parseFloat(kas)*1e8));
  const u = await (await fetch('https://api-tn10.kaspa.org/addresses/'+WALLET+'/utxos')).json();
  u.sort((a,b)=>Number(BigInt(b.utxoEntry.amount)-BigInt(a.utxoEntry.amount)));
  const ins=[{txId:u[0].outpoint.transactionId,index:u[0].outpoint.index,sequence:0,spk:'20'+USER+'ac',amount:BigInt(u[0].utxoEntry.amount)}];
  const outs=[{amount:amt,scriptPublicKey:spkD},{amount:ins[0].amount-amt-2000000n,scriptPublicKey:ins[0].spk}];
  const sig='41'+hex(B.concat([secp.schnorr.signSync(sighash(ins,outs,0),PRIV),B.from([1])]))+'';
  const tx={version:1,lockTime:0,subnetworkId:'00'.repeat(20),gas:0,payload:'',mass:0,
    inputs:[{previousOutpoint:{transactionId:ins[0].txId,index:ins[0].index},signatureScript:sig,sequence:0,sigOpCount:0,computeBudget:10}],
    outputs:outs.map(o=>({value:Number(o.amount),scriptPublicKey:'0000'+o.scriptPublicKey}))};
  const ws=new WebSocket('wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json',{headers:{'User-Agent':'Mozilla/5.0','Origin':'https://wallet.kaspanet.io'}});
  ws.on('open',()=>ws.send(JSON.stringify({id:1,method:'submitTransaction',params:{transaction:tx,allowOrphan:true}})));
  ws.on('message',d=>{console.log('💧',d.toString().slice(0,200));ws.close();});
})();
