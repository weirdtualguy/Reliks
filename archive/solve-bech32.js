const fs = require('fs');
const CH='qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN_STD=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3].map(BigInt);
const GEN_KAS=[0x98f2ffff8,0x7f0ef1070,0x2493d6628,0x81a3500c8,0x8755401c0].map(BigInt);
const H=s=>{const t=s.replace(/\s/g,'');const o=Buffer.alloc(t.length/2);for(let i=0;i<o.length;i++)o[i]=parseInt(t.substr(i*2,2),16);return o;};
const cv=(d,f,t,p)=>{let a=0,b=0,o=[];const m=(1<<t)-1;for(const v of d){a=(a<<f)|v;b+=f;while(b>=t){b-=t;o.push((a>>b)&m);}}if(p&&b>0)o.push((a<<(t-b))&m);return o;};
function pmW(vals,shift,G){const M=1n<<BigInt(shift),SM=BigInt(shift);let c=1n;
  for(const v of vals){const t=c>>SM;c=((c&(M-1n))<<5n)^BigInt(v);for(let i=0;i<5;i++)if((t>>BigInt(i))&1n)c^=G[i];}
  return c;}
function syms(S,order){const o=[];for(let i=0;i<8;i++){const e=order==='msb'?7-i:i;o.push(Number((S>>(5n*BigInt(e)))&31n));}return o;}
function val(a,order){let v=0n;for(let i=0;i<8;i++){const e=order==='msb'?7-i:i;v+=BigInt(a[i])*(32n**BigInt(e));}return v;}
function hrpExp(mode,hrp){const cs=[...hrp].map(c=>c.charCodeAt(0));
  if(mode==='bip173')return cs.map(c=>c>>5).concat([0],cs.map(c=>c&31));
  if(mode==='raw')return cs; if(mode==='raw31')return cs.map(c=>c&31); return [];}
function feedFor(r,pk){const d5=cv([0,...H(pk)],8,5,true);let feed;
  if(r.mode!==null){feed=hrpExp(r.mode,'kaspatest').concat(d5);}else{const pb=[...'kaspatest'].map(c=>c.charCodeAt(0));feed=pb.concat([0,...H(pk)]);}
  if(r.zeros)feed=feed.concat(new Array(8).fill(0)); return feed;}
function encode(pk,r,X){const d5=cv([0,...H(pk)],8,5,true);const S=pmW(feedFor(r,pk),r.shift,r.Gref)^X;
  return 'kaspatest:'+[...d5,...syms(S,r.order)].map(x=>CH[x]).join('');}
async function restStatus(addr){ for(let i=0;i<3;i++){ try{ const r=await fetch('https://api-tn10.kaspa.org/addresses/'+addr+'/utxos'); return r.status; }catch(e){ await new Promise(r=>setTimeout(r,2000)); } } return null; }
const CAL_PK='33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const CAL_ADDR='kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';
const SES_PK='420ba5822cce59fdac283b3731319e3d919996361d043c7a1050828f3ef55078';
const target=[...CAL_ADDR.slice(-8)].map(c=>CH.indexOf(c));
(async()=>{
  // control: corrupted checksum must NOT be accepted, else oracle is useless
  const bad = CAL_ADDR.slice(0,-1) + (CAL_ADDR.slice(-1)==='d'?'k':'d');
  const cs = await restStatus(bad);
  if(cs===null){ console.log('❌ network dead — re-run later'); process.exit(2); }
  if(cs===200){ console.log('❌ REST accepts bad checksums (status 200) — oracle invalid'); process.exit(3); }
  console.log('control ok: corrupted address rejected with status', cs);
  const combos=[];
  for(const G of [GEN_KAS,GEN_STD])for(const mode of ['bip173','raw','raw31',null])for(const shift of [35,25])for(const zeros of [true,false])for(const order of ['msb','lsb'])
    combos.push({G:G===GEN_KAS?'kas':'std',Gref:G,mode,shift,zeros,order});
  let netDead=0;
  for(const r of combos){
    const X = pmW(feedFor(r,CAL_PK),r.shift,r.Gref) ^ val(target,r.order);
    if(encode(CAL_PK,r,X)!==CAL_ADDR){ console.log('selfcheck bug', r.G, r.mode, r.shift, r.zeros, r.order); continue; }
    const addr = encode(SES_PK,r,X);
    const st = await restStatus(addr);
    if(st===null){ netDead++; if(netDead>8){ console.log('❌ network dead mid-search — re-run'); process.exit(2); } continue; }
    if(st===200){
      const recipe={G:r.G,mode:r.mode,shift:r.shift,zeros:r.zeros,order:r.order,X:'0x'+X.toString(16)};
      console.log('✅ WINNER', JSON.stringify(recipe));
      console.log('session address:', addr);
      const lines=[];
      lines.push('export const RECIPE = '+JSON.stringify(recipe)+';');
      lines.push("const CH='"+CH+"';");
      lines.push('const GENS={std:['+GEN_STD.map(x=>x.toString()).join(',')+'].map(BigInt),kas:['+GEN_KAS.map(x=>x.toString()).join(',')+'].map(BigInt)};');
      lines.push("const H=s=>{const t=s.replace(/\\s/g,'');const o=new Uint8Array(t.length/2);for(let i=0;i<o.length;i++)o[i]=parseInt(t.substr(i*2,2),16);return o;};");
      lines.push('const cv=(d,f,t,p)=>{let a=0,b=0,o=[];const m=(1<<t)-1;for(const v of d){a=(a<<f)|v;b+=f;while(b>=t){b-=t;o.push((a>>b)&m);}}if(p&&b>0)o.push((a<<(t-b))&m);return o;};');
      lines.push('function pmW(vals,shift,G){const M=1n<<BigInt(shift),SM=BigInt(shift);let c=1n;for(const v of vals){const t=c>>SM;c=((c&(M-1n))<<5n)^BigInt(v);for(let i=0;i<5;i++)if((t>>BigInt(i))&1n)c^=G[i];}return c;}');
      lines.push("function syms(S,order){const o=[];for(let i=0;i<8;i++){const e=order==='msb'?7-i:i;o.push(Number((S>>(5n*BigInt(e)))&31n));}return o;}");
      lines.push('function hrpExp(mode,hrp){const cs=[...hrp].map(c=>c.charCodeAt(0));if(mode===\'bip173\')return cs.map(c=>c>>5).concat([0],cs.map(c=>c&31));if(mode===\'raw\')return cs;if(mode===\'raw31\')return cs.map(c=>c&31);return [];}');
      lines.push('export function encodePub(pk){const r=RECIPE;const X=BigInt(r.X);const d5=cv([0,...H(pk)],8,5,true);let feed;');
      lines.push('if(r.mode!==null){feed=hrpExp(r.mode,\'kaspatest\').concat(d5);}else{const pb=[...\'kaspatest\'].map(c=>c.charCodeAt(0));feed=pb.concat([0,...H(pk)]);}');
      lines.push('if(r.zeros)feed=feed.concat(new Array(8).fill(0));');
      lines.push("const S=pmW(feed,r.shift,GENS[r.G])^X;return 'kaspatest:'+[...d5,...syms(S,r.order)].map(x=>CH[x]).join('');}");
      fs.writeFileSync('bech32-solved.js', lines.join('\n')+'\n');
      console.log('✅ wrote bech32-solved.js');
      process.exit(0);
    }
  }
  console.log('❌ no combo validated — re-run or extend space');
})();
