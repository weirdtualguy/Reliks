const { blake2b } = require('@noble/hashes/blake2b');
const B = Buffer;
// Integer-only generative engine (engine_lang 0 = integer SVG). No floats, no
// Math.random, no Date: byte-identical across Node and browser engines.
const ENGINE_SRC = `
function reliks(L, serial){
  var x=(L[0]^serial)|0, y=L[1]|0, z=L[2]|0, w=L[3]|0;
  function rnd(){ var t=(x^(x<<11))|0; x=y; y=z; z=w; w=(w^(w>>>19))^(t^(t>>>8)); return w>>>0; }
  function ri(a,b){ return a+(rnd()%(b-a+1)); }
  var n=ri(18,48), out=[];
  for(var i=0;i<n;i++){
    var cx=ri(0,1000), cy=ri(0,1000), r=ri(20,240);
    var h=rnd()%360, s=ri(40,90), l=ri(30,70);
    out.push('<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="hsl('+h+','+s+'%,'+l+'%)" fill-opacity="0.'+ri(30,85)+'"/>');
  }
  var m=ri(3,9), d='M'+ri(0,1000)+' '+ri(0,1000);
  for(var j=0;j<m;j++){ d+=' L'+ri(0,1000)+' '+ri(0,1000); }
  out.push('<path d="'+d+'" fill="none" stroke="#'+('00000'+(rnd()%0xffffff).toString(16)).slice(-6)+'" stroke-width="'+ri(1,6)+'"/>');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect width="1000" height="1000" fill="#000"/>'+out.join('')+'</svg>';
}`;
const TEST_SERIAL = 1;
function seedLanes(serial) {
  const le = B.alloc(8); le.writeBigUInt64LE(BigInt(serial));
  const h = blake2b(B.concat([B.from('ReliksSeedV10', 'utf8'), le]), { dkLen: 32 });
  const lanes = [];
  const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
  for (let i = 0; i < 8; i++) lanes.push(dv.getInt32(i * 4, true));
  return lanes;
}
const compiled = new Function('L', 'serial', ENGINE_SRC + '\nreturn reliks(L,serial);');
function render(serial) { const s = Number(BigInt(serial) & 0xFFFFFFFFn); return compiled(seedLanes(s), s | 0); }
const engineHashHex = B.from(blake2b(B.from(ENGINE_SRC, 'utf8'), { dkLen: 32 })).toString('hex');
const renderHashHex = B.from(blake2b(B.from(render(TEST_SERIAL), 'utf8'), { dkLen: 32 })).toString('hex');
module.exports = { ENGINE_SRC, seedLanes, render, engineHashHex, renderHashHex, TEST_SERIAL };
if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'hash') console.log('engine_hash', engineHashHex, '\nrender_hash', renderHashHex, '\nengine_bytes', B.byteLength(ENGINE_SRC));
  else if (cmd === 'render') process.stdout.write(render(parseInt(process.argv[3] || '1', 10)));
  else console.log('usage: node reliks-engine-v10.js hash | render <serial>');
}
