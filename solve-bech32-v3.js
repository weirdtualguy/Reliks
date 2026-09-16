const fs = require('fs');
const src = fs.readFileSync('kaddr.rs', 'utf8');
const CH='qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const HRP={Mainnet:'kaspa',Testnet:'kaspatest',Simnet:'kaspasim',Devnet:'kaspadev',A:'a',B:'b'};
const VER={PubKey:0,PubKeyECDSA:1,ScriptHash:8};
const GEN_STD=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3].map(BigInt);
const GEN_KAS=[0x98f2ffff8,0x7f0ef1070,0x2493d6628,0x81a3500c8,0x8755401c0].map(BigInt);
function unesc(s){const o=[];let i=0;while(i<s.length){const c=s[i];if(c==='\\'){const n=s[i+1];
  if(n==='x'){o.push(parseInt(s.substr(i+2,2),16));i+=4;}else if(n==='n'){o.push(10);i+=2;}else if(n==='t'){o.push(9);i+=2;}else if(n==='r'){o.push(13);i+=2;}else if(n==='0'){o.push(0);i+=2;}else{o.push(s.charCodeAt(i+1));i+=2;}}
  else{o.push(s.charCodeAt(i));i++;}}return o;}
const vecs=[]; const re=/Address::new\(Prefix::(\w+),\s*Version::(\w+),\s*(&\[\w+;\s*(\d+)\]|b"((?:[^"\\]|\\.)*)")\)\s*,\s*"([^"]+)"\)/g;
let m; while((m=re.exec(src))){ const payload = m[3].startsWith('&[') ? new Array(parseInt(m[4])).fill(0) : unesc(m[5]);
  vecs.push({hrp:HRP[m[1]], version:VER[m[2]], payload, addr:m[6]}); }
console.log('parsed vectors:', vecs.length);
if (!vecs.length) { const i = src.indexOf('Address::new'); console.log('DEBUG:', JSON.stringify(src.slice(i, i + 300))); process.exit(1); }
const cv=(d,f,t,p)=>{let a=0,b=0,o=[];const mx=(1<<t)-1;for(const v of d){a=(a<<f)|v;b+=f;while(b>=t){b-=t;o.push((a>>b)&mx);}}if(p&&b>0)o.push((a<<(t-b))&mx);return o;};
function pmW(vals,shift,G){const M=1n<<BigInt(shift),SM=BigInt(shift);let c=1n;
  for(const v of vals){const t=c>>SM;c=((c&(M-1n))<<5n)^BigInt(v);for(let i=0;i<5;i++)if((t>>BigInt(i))&1n)c^=G[i];}return c;}
function syms(S,order){const o=[];for(let i=0;i<8;i++){const e=order==='msb'?7-i:i;o.push(Number((S>>(5n*BigInt(e)))&31n));}return o;}
function val(a,order){let v=0n;for(let i=0;i<8;i++){const e=order==='msb'?7-i:i;v+=BigInt(a[i])*(32n**BigInt(e));}return v;}
function hrpExp(mode,hrp){const cs=[...hrp].map(c=>c.charCodeAt(0));
  if(mode==='bip173')return cs.map(c=>c>>5).concat([0],cs.map(c=>c&31));
  if(mode==='raw')return cs; if(mode==='raw31')return cs.map(c=>c&31); return [];}
function feedFor(r,hrp,bytes){const d5=cv(bytes,8,5,true);let feed;
  if(r.mode!==null){feed=hrpExp(r.mode,hrp).concat(d5);}else{feed=[...hrp].map(c=>c.charCodeAt(0)).concat(bytes);}
  if(r.zeros)feed=feed.concat(new Array(8).fill(0)); return feed;}
function encode(v,r,X){const d5=cv([v.version,...v.payload],8,5,true);const S=pmW(feedFor(r,v.hrp,[v.version,...v.payload]),r.shift,r.Gref)^X;
  return v.hrp+':'+[...d5,...syms(S,r.order)].map(x=>CH[x]).join('');}
const combos=[];
for(const G of [GEN_KAS,GEN_STD])for(const mode of ['bip173','raw','raw31',null])for(const shift of [35,25])for(const zeros of [true,false])for(const order of ['msb','lsb'])
  combos.push({G:G===GEN_KAS?'kas':'std',Gref:G,mode,shift,zeros,order});
for(const r of combos){
  const t=[...vecs[0].addr.slice(-8)].map(c=>CH.indexOf(c));
  const X = pmW(feedFor(r,vecs[0].hrp,[vecs[0].version,...vecs[0].payload]),r.shift,r.Gref) ^ val(t,vecs[0].addr? r.order : r.order);
  let okAll = true;
  for(const v of vecs){ if(encode(v,r,X)!==v.addr){ okAll=false; break; } }
  if(okAll){
    const recipe={G:r.G,mode:r.mode,shift:r.shift,zeros:r.zeros,order:r.order,X:'0x'+X.toString(16)};
    console.log('✅ WINNER', JSON.stringify(recipe));
    const L=[];
    L.push('export const RECIPE = '+JSON.stringify(recipe)+';');
    L.push("const CH='"+CH+"';");
    L.push('const GENS={std:['+GEN_STD.map(x=>x.toString()).join(',')+'].map(BigInt),kas:['+GEN_KAS.map(x=>x.toString()).join(',')+'].map(BigInt)};');
    L.push("const H=s=>{const t=s.replace(/\\s/g,'');const o=new Uint8Array(t.length/2);for(let i=0;i<o.length;i++)o[i]=parseInt(t.substr(i*2,2),16);return o;};");
    L.push('const cv=(d,f,t,p)=>{let a=0,b=0,o=[];const mx=(1<<t)-1;for(const v of d){a=(a<<f)|v;b+=f;while(b>=t){b-=t;o.push((a>>b)&mx);}}if(p&&b>0)o.push((a<<(t-b))&mx);return o;};');
    L.push('function pmW(vals,shift,G){const M=1n<<BigInt(shift),SM=BigInt(shift);let c=1n;for(const v of vals){const t=c>>SM;c=((c&(M-1n))<<5n)^BigInt(v);for(let i=0;i<5;i++)if((t>>BigInt(i))&1n)c^=G[i];}return c;}');
    L.push("function syms(S,order){const o=[];for(let i=0;i<8;i++){const e=order==='msb'?7-i:i;o.push(Number((S>>(5n*BigInt(e)))&31n));}return o;}");
    L.push("function hrpExp(mode,hrp){const cs=[...hrp].map(c=>c.charCodeAt(0));if(mode==='bip173')return cs.map(c=>c>>5).concat([0],cs.map(c=>c&31));if(mode==='raw')return cs;if(mode==='raw31')return cs.map(c=>c&31);return [];}");
    L.push('export function encodePub(pk){const r=RECIPE;const X=BigInt(r.X);const bytes=[0,...H(pk)];const d5=cv(bytes,8,5,true);let feed;');
    L.push("if(r.mode!==null){feed=hrpExp(r.mode,'kaspatest').concat(d5);}else{feed=[...'kaspatest'].map(c=>c.charCodeAt(0)).concat(bytes);}");
    L.push('if(r.zeros)feed=feed.concat(new Array(8).fill(0));');
    L.push("const S=pmW(feed,r.shift,GENS[r.G])^X;return 'kaspatest:'+[...d5,...syms(S,r.order)].map(x=>CH[x]).join('');}");
    fs.writeFileSync('bech32-solved.js', L.join('\n')+'\n');
    console.log('✅ wrote bech32-solved.js');
    process.exit(0);
  }
}
console.log('❌ none of', combos.length, 'combos matched all vectors');
