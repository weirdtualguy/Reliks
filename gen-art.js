const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');

// A compact generative flow-field / geometric art program
// It reads window.SERIAL as the seed to produce unique art for each edition
const artSource = `<!DOCTYPE html><html><head><style>body{margin:0;background:#0a0a0a;display:flex;justify-content:center;align-items:center;height:100vh}canvas{border:1px solid #333}</style></head><body><canvas id="c" width="800" height="800"></canvas><script>
const c=document.getElementById('c'),x=c.getContext('2d');
const seed=window.SERIAL||0;let s=seed*9301+49297;
const rnd=()=>{s=(s*9301+49297)%233280;return s/233280;};
x.fillStyle='#0a0a0a';x.fillRect(0,0,800,800);
for(let i=0;i<300;i++){
  x.beginPath();
  const cx=rnd()*800,cy=rnd()*800,r=rnd()*80+20;
  x.arc(cx,cy,r,0,Math.PI*2);
  const hue=(rnd()*60+seed*40)%360;
  x.fillStyle=\`hsla(\${hue},70%,60%,0.4)\`;
  x.fill();
  x.strokeStyle=\`hsla(\${hue},90%,80%,0.8)\`;
  x.lineWidth=2;x.stroke();
}
for(let i=0;i<50;i++){
  x.beginPath();
  x.moveTo(rnd()*800,rnd()*800);
  x.lineTo(rnd()*800,rnd()*800);
  x.strokeStyle=\`hsla(\${(seed*50+i*10)%360},100%,90%,0.3)\`;
  x.lineWidth=rnd()*5+1;x.stroke();
}
</script></body></html>`;

// Pad or truncate to exactly 2048 bytes
const targetLen = 2048;
let artBytes = Buffer.from(artSource, 'utf8');
if (artBytes.length > targetLen) {
  console.error('❌ Art program too long:', artBytes.length, 'bytes. Max is', targetLen);
  process.exit(1);
}
// Pad with null bytes or spaces to exactly 2048 bytes
const padding = Buffer.alloc(targetLen - artBytes.length, 0x20); // pad with spaces
artBytes = Buffer.concat([artBytes, padding]);

const programHash = blake2b(artBytes, { dkLen: 32 });
console.log('✅ Art program length:', artBytes.length, 'bytes');
console.log('✅ Program hash:', programHash.toString('hex'));

fs.writeFileSync('art-program.bin', artBytes);
fs.writeFileSync('art-program.hex', artBytes.toString('hex'));
console.log('💾 Saved to art-program.bin and art-program.hex');
