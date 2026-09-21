const { blake2b } = require('@noble/hashes/blake2b');
const B = Buffer;

// "The Kaspa DAG Relik" - Integer-only geometric constellation
// No floats, no Math.random. Pure deterministic integer math.
const ENGINE_SRC = `
function reliks(L, serial){
  var x=(L[0]^serial)|0, y=L[1]|0, z=L[2]|0, w=L[3]|0;
  function rnd(){ var t=(x^(x<<11))|0; x=y; y=z; z=w; w=(w^(w>>>19))^(t^(t>>>8)); return w>>>0; }
  function ri(a,b){ return a+(rnd()%(b-a+1)); }
  
  // Integer pseudo-trig for geometric rotation (scaled by 1000)
  var TAU = 6283; 
  var nodes = [], edges = [];
  var numNodes = ri(12, 24);
  var cx = 500, cy = 500;
  
  // Generate DAG nodes in a spiral/constellation
  for(var i=0; i<numNodes; i++){
    var angle = (i * TAU / numNodes) + ri(-200, 200);
    var dist = ri(100, 400);
    // Integer approximation of sin/cos using Taylor series or just linear mapping for abstract art
    var nx = cx + (dist * ((angle % 1000) - 500)) / 1000;
    var ny = cy + (dist * (((angle + 250) % 1000) - 500)) / 1000;
    var r = ri(8, 25);
    var hue = (serial + i * 37) % 360;
    nodes.push({x:nx, y:ny, r:r, hue:hue});
  }
  
  // Connect nodes to form the "DAG" (Directed Acyclic Graph) edges
  var out = [];
  out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">');
  out.push('<rect width="1000" height="1000" fill="#050508"/>');
  
  // Draw edges first (behind nodes)
  for(var i=0; i<nodes.length; i++){
    var connections = ri(1, 3);
    for(var j=0; j<connections; j++){
      var target = ri(0, nodes.length-1);
      if(target !== i){
        var opacity = ri(10, 40) / 100;
        out.push('<line x1="'+nodes[i].x+'" y1="'+nodes[i].y+'" x2="'+nodes[target].x+'" y2="'+nodes[target].y+'" stroke="hsl('+nodes[i].hue+',70%,60%)" stroke-width="'+ri(1,3)+'" opacity="'+opacity+'"/>');
      }
    }
  }
  
  // Draw the central "Relik" (a rotating polygon)
  var relikSides = ri(5, 8);
  var relikRadius = ri(80, 150);
  var relikPath = 'M';
  for(var i=0; i<relikSides; i++){
    var a = (i * TAU / relikSides);
    var rx = cx + (relikRadius * ((a % 1000) - 500)) / 1000;
    var ry = cy + (relikRadius * (((a + 250) % 1000) - 500)) / 1000;
    relikPath += (i===0?'':' L') + rx + ' ' + ry;
  }
  relikPath += ' Z';
  out.push('<path d="'+relikPath+'" fill="none" stroke="#fff" stroke-width="4" opacity="0.8"/>');
  out.push('<path d="'+relikPath+'" fill="hsl('+(serial%360)+',80%,50%)" opacity="0.1"/>');

  // Draw nodes
  for(var i=0; i<nodes.length; i++){
    var n = nodes[i];
    out.push('<circle cx="'+n.x+'" cy="'+n.y+'" r="'+n.r+'" fill="hsl('+n.hue+',80%,65%)" opacity="0.9"/>');
    out.push('<circle cx="'+n.x+'" cy="'+n.y+'" r="'+(n.r+4)+'" fill="none" stroke="#fff" stroke-width="1" opacity="0.3"/>');
  }
  
  out.push('</svg>');
  return out.join('');
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
  const serial = parseInt(process.argv[2] || '1', 10);
  process.stdout.write(render(serial));
}
