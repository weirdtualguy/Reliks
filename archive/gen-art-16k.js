const fs = require('fs');
const base = '<!DOCTYPE html><html><head><style>body{margin:0;background:#0a0a0a;display:flex;justify-content:center;align-items:center;height:100vh}canvas{border:1px solid #333}</style></head><body><canvas id="c" width="800" height="800"></canvas><script>' +
'const c=document.getElementById("c"),x=c.getContext("2d");' +
'const seed=window.SERIAL||0;let s=seed*9301+49297;' +
'const rnd=()=>{s=(s*9301+49297)%233280;return s/233280;};' +
'x.fillStyle="#0a0a0a";x.fillRect(0,0,800,800);' +
'for(let i=0;i<800;i++){x.beginPath();const cx=rnd()*800,cy=rnd()*800,r=rnd()*50+5;x.arc(cx,cy,r,0,Math.PI*2);const hue=(rnd()*360+seed*40)%360;x.fillStyle="hsla("+hue+",70%,60%,0.35)";x.fill();x.strokeStyle="hsla("+hue+",90%,80%,0.7)";x.lineWidth=1.5;x.stroke();}' +
'for(let i=0;i<200;i++){x.beginPath();x.moveTo(rnd()*800,rnd()*800);x.bezierCurveTo(rnd()*800,rnd()*800,rnd()*800,rnd()*800,rnd()*800,rnd()*800);x.strokeStyle="hsla("+((seed*50+i*7)%360)+",100%,90%,0.25)";x.lineWidth=rnd()*4+0.5;x.stroke();}' +
'for(let i=0;i<400;i++){const px=rnd()*800,py=rnd()*800;x.fillStyle="hsla("+((seed*30+i)%360)+",100%,95%,0.9)";x.fillRect(px,py,2,2);}' +
'</script></body></html>';
const TARGET = 16384;
const baseLen = Buffer.byteLength(base, 'utf8');
const padNeeded = TARGET - baseLen;
if (padNeeded < 8) { console.error('base too large to pad'); process.exit(1); }
const comment = '<!--' + 'A'.repeat(padNeeded - 7) + '-->';
const art = base.replace('</body>', comment + '</body>');
const artBuf = Buffer.from(art, 'utf8');
console.log('base bytes:', baseLen, '| padded bytes:', artBuf.length);
if (artBuf.length !== TARGET) { console.error('SIZE MISMATCH'); process.exit(1); }
fs.writeFileSync('art-program-v5.hex', artBuf.toString('hex'));
console.log('wrote art-program-v5.hex — 16384 bytes = 8 chunks of 2048');
