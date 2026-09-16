const CH='qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN=[0x98f2bc8e61n,0x79b76d99e2n,0xf33e5fb3c4n,0xae2eabe2a8n,0x1e4f43e470n];
const H=s=>{const t=s.replace(/\s/g,'');const o=new Uint8Array(t.length/2);for(let i=0;i<o.length;i++)o[i]=parseInt(t.substr(i*2,2),16);return o;};

function polymod(values){let c=1n;for(const d of values){const c0=c>>35n;c=((c&0x07ffffffffn)<<5n)^BigInt(d);
  if(c0&1n)c^=GEN[0];if(c0&2n)c^=GEN[1];if(c0&4n)c^=GEN[2];if(c0&8n)c^=GEN[3];if(c0&16n)c^=GEN[4];}return c^1n;}

function conv8to5(bytes){const out=[];let buff=0,bits=0;
  for(const b of bytes){buff=(buff<<8)|b;bits+=8;while(bits>=5){bits-=5;out.push((buff>>bits)&31);buff&=(1<<bits)-1;}}
  if(bits>0)out.push((buff<<(5-bits))&31);return out;}

function conv5to8(payload){const out=[];let buff=0,bits=0;
  for(const c of payload){buff=(buff<<5)|c;bits+=5;while(bits>=8){bits-=8;out.push((buff>>bits)&255);buff&=(1<<bits)-1;}}return out;}

function checksum(payload_5bit, hrp_bytes){
  const prefix=[...hrp_bytes].map(c=>c&0x1f);
  const feed=[...prefix, 0, ...payload_5bit, 0,0,0,0,0,0,0,0];
  return polymod(feed);}

export function encodePub(pkHex){
  const payload=[0,...H(pkHex)]; // version 0 + 32-byte pubkey
  const fivebit_payload=conv8to5(payload);
  const hrp_bytes=[...'kaspatest'].map(c=>c.charCodeAt(0));
  const chk=checksum(fivebit_payload, hrp_bytes);
  
  // Take low 40 bits as 5 bytes (big-endian order: to_be_bytes()[3..])
  const chkBytes=[];
  for(let i=4;i>=0;i--)chkBytes.push(Number((chk>>BigInt(i*8))&0xffn));
  const checksum_5bit=conv8to5(chkBytes);
  
  const full=[...fivebit_payload,...checksum_5bit];
  return 'kaspatest:'+full.map(c=>CH[c]).join('');}

// Test against the known vector from rusty-kaspa lib.rs line 489
const test_pk='00'.repeat(32);
const expected='kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhqrxplya';
const result=encodePub(test_pk);
console.log('Test vector:', result===expected?'✅ PASS':'❌ FAIL');
console.log('Expected:   ', expected);
console.log('Got:        ', result);
