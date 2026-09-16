const fs = require('fs');
let s = fs.readFileSync('web/index.html', 'utf8');
const start = s.indexOf('const CH='); const end = s.indexOf('function parsePushes');
if (start < 0 || end < 0) { console.error('markers not found'); process.exit(1); }
const block = `const CH='qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
function pmv(vals){let c=1;for(const v of vals){const c0=Math.floor(c/0x20000000);c=((c-c0*0x20000000)*32)^v;for(let i=0;i<5;i++)if((c0>>i)&1)c^=GEN[i];}return c;}
const ex=h=>[...h].map(c=>c.charCodeAt(0)>>5).concat([0,...[...h].map(c=>c.charCodeAt(0)&31)]);
const cv=(d,f,t,p)=>{let a=0,b=0,o=[];const m=(1<<t)-1;for(const v of d){a=(a<<f)|v;b+=f;while(b>=t){b-=t;o.push((a>>b)&m);}}if(p&&b>0)o.push((a<<(t-b))&m);return o;};
function encodeWith(hrp,v8,sep,clen,xor){const d=cv(v8,8,5,true);const c=pmv(ex(hrp).concat(d,new Array(clen).fill(0)))^xor;const cs=[];for(let i=clen-1;i>=0;i--)cs.push(Math.floor(c/(2**(5*i)))&31);return hrp+sep+[...d,...cs].map(x=>CH[x]).join('');}
const CAL_PK='33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const CAL_ADDR='kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';
let BW=null;
(function(){const v8=[0,...H(CAL_PK)];for(const sep of [':','1'])for(const clen of [8,6])for(const xor of [1,0x2bc830a3])if(encodeWith('kaspatest',v8,sep,clen,xor)===CAL_ADDR){BW={sep,clen,xor};return;}throw new Error('bech32 calibration failed');})();
const bech32=(hrp,v8)=>encodeWith(hrp,v8,BW.sep,BW.clen,BW.xor);
`;
s = s.slice(0, start) + block + s.slice(end);
s = s.split("node drip.js ' + addr + ' 60").join("node drip.js ' + pub + ' 60   (address ' + addr + ')");
fs.writeFileSync('web/index.html', s);
console.log('✅ dApp bech32 calibrated & patched');
