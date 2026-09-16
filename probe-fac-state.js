const fs=require('fs');
const {blake2b}=require('@noble/hashes/blake2b');
const B=Buffer;const hex=b=>B.from(b).toString('hex');const H=s=>B.from(s,'hex');
const le16=n=>{const b=B.alloc(2);b.writeUInt16LE(n);return b;};
const sm8=n=>{const b=B.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const pe=p=>{const n=p.length;if(n===0)return B.from([0x00]);if(n<=75)return B.concat([B.from([n]),p]);if(n<=255)return B.concat([B.from([0x4c,n]),p]);return B.concat([B.from([0x4d]),le16(n),p]);};
const F=JSON.parse(fs.readFileSync('factory-abi-v3.json','utf8'));
const c=F.contracts[Object.keys(F.contracts)[0]];
const bc=B.from(c.compiled.bytecode);const s=c.compiled.state_span;
const pre=bc.subarray(0,s.offset),suf=bc.subarray(s.offset+s.len);
const A=JSON.parse(fs.readFileSync('factory-args-v3.json','utf8'));
const artHex=B.from(A[0].value).toString('hex');
const artist=hex(B.from(A[1].value));
const price=A[2].value,roy=A[3].value,cap=A[4].value;
const L=JSON.parse(fs.readFileSync('factory-ledger-v3.json','utf8'));
const enc=v=>B.concat(c.runtime_state.fields.map(f=>{const t=f.type.kind,x=v[f.name];if(t==='int'||t==='temporal')return pe(sm8(x));if(t==='byte')return pe(B.from([x]));return pe(H(x));}));
const p2sh=R=>'aa20'+hex(blake2b(R,{dkLen:32}))+'87';
const st=k=>({art:artHex,artist,price,royalty_bips:roy,cap,counter:k});
(async()=>{
  const cov=await (await fetch('https://kascov.io/data/testnet-10/c/'+L.covenantId+'.json')).json();
  const live=(cov.utxos||[]).find(u=>u.live);
  console.log('events:',cov.events.map(e=>e.kind).join(' -> '));
  for(let k=1;k<=3;k++){const sp=p2sh(B.concat([pre,enc(st(k)),suf]));
    console.log('counter='+k+':',sp,(live&&live.script_hex===sp)?'  <-- LIVE':'');}
})();
