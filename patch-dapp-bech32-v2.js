const fs = require('fs');
let s = fs.readFileSync('web/index.html', 'utf8');
const start = s.indexOf('const CH='); const end = s.indexOf('function parsePushes');
if (start < 0 || end < 0) { console.error('markers not found'); process.exit(1); }
const block = `const CH='qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
function pm5(vals){let c=1;for(const v of vals){const t=Math.floor(c/0x20000000);c=((c-t*0x20000000)*32)^v;for(let i=0;i<5;i++)if((t>>i)&1)c^=GEN[i];}return c;}
function pm8(vals){let c=1;for(const v of vals){const t=Math.floor(c/0x20000000000);c=((c-t*0x20000000000)*32)^v;for(let i=0;i<5;i++)if((t>>i)&1)c^=GEN[i];}return c;}
function cvd(d,f,t,p){let a=0,b=0,o=[];const m=(1<<t)-1;for(const v of d){a=(a<<f)|v;b+=f;while(b>=t){b-=t;o.push((a>>b)&m);}}if(p&&b>0)o.push((a<<(t-b))&m);return o;}
function syms(S,clen,order){const o=[];if(order==='msb'){for(let i=clen-1;i>=0;i--)o.push(Math.floor(S/Math.pow(2,5*i))&31);}else{for(let i=0;i<clen;i++)o.push(Math.floor(S/Math.pow(2,5*i))&31);}return o;}
function hrpExp(mode,hrp){const cs=[...hrp].map(c=>c.charCodeAt(0));
  if(mode==='bip173')return cs.map(c>>5).concat([0],cs.map(c=>c&31));
  if(mode==='raw')return cs; if(mode==='raw31')return cs.map(c=>c&31); return [];}
function tryRecipe(r,hrp,v8){const d5=cvd(v8,8,5,true);let feed,poly;
  if(r.fam==='A'){feed=hrpExp(r.mode,hrp).concat(d5);poly=pm5;}
  else if(r.fam==='C'){const pb=[...hrp].map(c=>c.charCodeAt(0));if(r.colon)pb.push(58);feed=pb.concat(v8);poly=pm8;}
  else {feed=hrpExp(r.mode,hrp).concat(v8);poly=pm8;}
  let S=poly(feed)^r.xor;
  return hrp+r.sep+[...d5,...syms(S,r.clen,r.order)].map(x=>CH[x]).join('');}
const RECIPES=[];
for(const sep of [':','1'])for(const clen of [8,6])for(const xor of [1,0])for(const order of ['msb','lsb'])for(const mode of ['bip173','raw','raw31','none'])RECIPES.push({fam:'A',sep,clen,xor,order,mode});
for(const sep of [':','1'])for(const clen of [8,6])for(const xor of [1,0])for(const order of ['msb','lsb'])for(const colon of [false,true])RECIPES.push({fam:'C',sep,clen,xor,order,colon});
for(const sep of [':','1'])for(const clen of [8,6])for(const xor of [1,0])for(const order of ['msb','lsb'])for(const mode of ['bip173','raw'])RECIPES.push({fam:'E',sep,clen,xor,order,mode});
const CAL_PK='33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const CAL_ADDR='kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';
let BW=null;
(function(){const v8=[0,...H(CAL_PK)];for(const r of RECIPES)if(tryRecipe(r,'kaspatest',v8)===CAL_ADDR){BW=r;return;}throw new Error('bech32 calibration failed');})();
const bech32=(hrp,v8)=>tryRecipe(BW,hrp,v8);
`;
s = s.slice(0, start) + block + s.slice(end);
fs.writeFileSync('web/index.html', s);
console.log('✅ dApp bech32 block replaced with full recipe search');
