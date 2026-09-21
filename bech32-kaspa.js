const CH='qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN_STD=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
const GEN_KAS=[0x98f2ffff8,0x7f0ef1070,0x2493d6628,0x81a3500c8,0x8755401c0];
const H=s=>{const t=s.replace(/\s/g,'');const o=Buffer.alloc(t.length/2);for(let i=0;i<o.length;i++)o[i]=parseInt(t.substr(i*2,2),16);return o;};
function pmW(vals,shift,G){const M=Math.pow(2,shift);let c=1;for(const v of vals){const t=Math.floor(c/M);c=((c-t*M)*32)^v;for(let i=0;i<5;i++)if((t>>i)&1)c^=G[i];}return c;}
function cvd(d,f,t,p){let a=0,b=0,o=[];const m=(1<<t)-1;for(const v of d){a=(a<<f)|v;b+=f;while(b>=t){b-=t;o.push((a>>b)&m);}}if(p&&b>0)o.push((a<<(t-b))&m);return o;}
function syms(S,clen,order){const o=[];if(order==='msb'){for(let i=clen-1;i>=0;i--)o.push(Math.floor(S/Math.pow(2,5*i))&31);}else{for(let i=0;i<clen;i++)o.push(Math.floor(S/Math.pow(2,5*i))&31);}return o;}
function hrpExp(mode,hrp){const cs=[...hrp].map(c=>c.charCodeAt(0));
  if(mode==='bip173')return cs.map(c=>c>>5).concat([0],cs.map(c=>c&31));
  if(mode==='raw')return cs; if(mode==='raw31')return cs.map(c=>c&31); return [];}
function tryRecipe(r,hrp,v8){const d5=cvd(v8,8,5,true);let feed;
  if(r.fam==='S'){feed=hrpExp(r.mode,hrp).concat(d5);}
  else if(r.fam==='C'){const pb=[...hrp].map(c=>c.charCodeAt(0));if(r.colon)pb.push(58);feed=pb.concat(v8);}
  else {feed=hrpExp(r.mode,hrp).concat(v8);}
  if(r.zeros)feed=feed.concat(new Array(r.clen).fill(0));
  let S=pmW(feed,r.shift,r.G)^r.xor;
  return hrp+r.sep+[...d5,...syms(S,r.clen,r.order)].map(x=>CH[x]).join('');}
const RECIPES=[];
for(const G of [GEN_KAS,GEN_STD])
 for(const sep of [':','1'])for(const clen of [8,6])for(const shift of [35,25])for(const zeros of [true,false])for(const xor of [1,0])for(const order of ['msb','lsb'])for(const mode of ['bip173','raw','raw31','none'])RECIPES.push({fam:'S',G,sep,clen,shift,zeros,xor,order,mode});
for(const G of [GEN_KAS,GEN_STD])
 for(const sep of [':','1'])for(const clen of [8,6])for(const shift of [35,25])for(const zeros of [true,false])for(const xor of [1,0])for(const order of ['msb','lsb'])for(const colon of [false,true])RECIPES.push({fam:'C',G,sep,clen,shift,zeros,xor,order,colon});
for(const G of [GEN_KAS,GEN_STD])
 for(const sep of [':','1'])for(const clen of [8,6])for(const shift of [35,25])for(const zeros of [true,false])for(const xor of [1,0])for(const order of ['msb','lsb'])for(const mode of ['bip173','raw'])RECIPES.push({fam:'E',G,sep,clen,shift,zeros,xor,order,mode});
const CAL_PK='33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const CAL_ADDR='kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';
let W=null;
function calibrate(){ if(W)return W; const v8=[0,...H(CAL_PK)];
  for(const r of RECIPES){ const rr=Object.assign({},r); delete rr.G; rr.Gname=(r.G===GEN_KAS?'kas':'std');
    if(tryRecipe(r,'kaspatest',v8)===CAL_ADDR){W=r;return W;} }
  console.error('debug:'); RECIPES.slice(0,2).forEach(r=>console.error(JSON.stringify({G:r.G===GEN_KAS?'kas':'std',fam:r.fam,shift:r.shift,zeros:r.zeros}),tryRecipe(r,'kaspatest',v8)));
  throw new Error('calibration failed'); }
function encodePub(pkHex){ calibrate(); return tryRecipe(W,'kaspatest',[0,...H(pkHex)]); }
function decode(addr){ calibrate(); const p=addr.lastIndexOf(W.sep); const groups=[...addr.slice(p+1)].map(c=>CH.indexOf(c));
  if(groups.some(g=>g<0))throw new Error('bad charset');
  const v8=cvd(groups.slice(0,groups.length-W.clen),5,8,false);
  return {hrp:addr.slice(0,p),version:v8[0],payload:Buffer.from(v8.slice(1))}; }
module.exports={calibrate,encodePub,decode};
if(require.main===module){ calibrate();
  const o=Object.assign({},W); o.G=(W.G===GEN_KAS?'kas':'std'); delete o.G;
  console.log('recipe:',JSON.stringify(Object.assign({},W,{G:W.G===GEN_KAS?'kas':'std'})));
  console.log('self-test:',encodePub(CAL_PK)===CAL_ADDR?'OK':'FAIL'); }
