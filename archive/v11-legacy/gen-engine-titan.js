// gen-engine-titan.js - assembles reliks-engine-titan.js at the ENGINE_CAP boundary.
// Build-time tables are deterministic (fixed seed); runtime engine is integer-only.
const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const CAP = Number(process.env.RELIKS_ENGINE_CAP || 32768);

let bs = 0x5EED1234;
function brnd(){ bs ^= bs << 13; bs >>>= 0; bs ^= bs >>> 17; bs ^= bs << 5; bs >>>= 0; return bs; }
function hx(n){ return ('0' + (n & 255).toString(16)).slice(-2); }

// 256-entry gradient LUT through fixed anchors
const anchors = [[8,10,24],[14,38,64],[20,110,110],[73,197,177],[231,223,200],[232,146,58],[110,40,36]];
const PAL = [];
for (let i = 0; i < 256; i++) {
  const f = i / 255 * (anchors.length - 1), k = Math.min(anchors.length - 2, f | 0), t = f - k;
  const a = anchors[k], b = anchors[k + 1];
  PAL.push('#' + hx(a[0] + (b[0]-a[0]) * t | 0) + hx(a[1] + (b[1]-a[1]) * t | 0) + hx(a[2] + (b[2]-a[2]) * t | 0));
}
// 256-entry noise permutation (fixed shuffle)
const PERM = []; for (let i = 0; i < 256; i++) PERM.push(i);
for (let i = 255; i > 0; i--) { const j = brnd() % (i + 1); const t = PERM[i]; PERM[i] = PERM[j]; PERM[j] = t; }

const TEMPLATE = [
'var SIN=__SIN__;',
'var PAL=__PAL__;',
'var PERM=__PERM__;',
'function reliks(L, serial){',
'var W=1600,H=1600,CX=800;',
'var x=(L[0]^serial)|0,y=(L[1]^0x5bf0)|0,z=(L[2]^0x1f3d)|0,w=(L[3]^0x7a11)|0;',
'function rnd(){var t=(x^(x<<11))|0;x=y;y=z;z=w;w=(w^(w>>>19))^(t^(t>>>8));return w>>>0;}',
'function ri(a,b){return a+(rnd()%(b-a+1));}',
'function pick(a){return a[rnd()%a.length];}',
'function chance(p){return rnd()%100<p;}',
'var P=SIN.length;',
'function sin(a){a=a%P;if(a<0)a+=P;return SIN[a];}',
'function cos(a){return sin(a+(P>>2));}',
'function mul(a,b){return (a*b)/10000|0;}',
'function sm(t){return (t*t*(30000-2*t))/100000000|0;}',
'function n2(i,j){return (PERM[(PERM[i&255]+(j&255))&255]*10000/255)|0;}',
'function l1(i,u){var a=n2(i,77),b=n2(i+1,77);return a+mul(b-a,sm(u));}',
'function l2(i,j,u,v){var t=n2(i,j)+mul(n2(i+1,j)-n2(i,j),sm(u));var b=n2(i,j+1)+mul(n2(i+1,j+1)-n2(i,j+1),sm(u));return t+mul(b-t,sm(v));}',
'function hexc(i){return PAL[i&255];}',
'var out=[];',
'var hor=ri(880,980),skyOff=ri(0,255),sy;',
'for(sy=0;sy<hor;sy+=20){out.push(\'<rect x="0" y="\'+sy+\'" width="\'+W+\'" height="20" fill="\'+hexc(skyOff+((sy*255/hor)|0))+\'"/>\');}',
'for(var k=0;k<5;k++){var base=ri(120,520),amp=ri(30,90),freq=ri(6,14),ph=ri(0,P),d=\'\';',
' for(var ax=0;ax<=W;ax+=40){var yy=base+((amp*sin(ph+((ax*freq)%P)))/10000|0)+(((amp>>1)*sin((ph*2)%P+((ax*freq*2)%P)))/10000|0);d+=(ax?\'L\':\'M\')+ax+\' \'+yy;}',
' out.push(\'<path d="\'+d+\'" fill="none" stroke="\'+hexc(ri(120,190))+\'" stroke-width="\'+ri(14,26)+\'" opacity="0.16"/>\');',
' out.push(\'<path d="\'+d+\'" fill="none" stroke="\'+hexc(ri(150,210))+\'" stroke-width="\'+ri(4,8)+\'" opacity="0.35"/>\');}',
'for(var st=0;st<240;st++){var sx=ri(10,W-10),sy2=ri(10,hor-40),sr=ri(1,4);',
' out.push(\'<circle cx="\'+sx+\'" cy="\'+sy2+\'" r="\'+sr+\'" fill="\'+hexc(ri(200,255))+\'" opacity="0.\'+ri(35,95)+\'"/>\');',
' if(st%9===0){out.push(\'<path d="M\'+(sx-sr*4)+\' \'+sy2+\'H\'+(sx+sr*4)+\'M\'+sx+\' \'+(sy2-sr*4)+\'V\'+(sy2+sr*4)+\'" stroke="\'+hexc(230)+\'" stroke-width="1" opacity="0.5"/>\');}}',
'for(var c=0;c<7;c++){var qx=ri(100,W-300),qy=ri(60,hor-200),pts=\'\';',
' for(var q=0;q<5;q++){pts+=(q?\' \':\'\')+qx+\',\'+qy;qx+=ri(40,110);qy+=ri(-70,70);}',
' out.push(\'<polyline points="\'+pts+\'" fill="none" stroke="\'+hexc(210)+\'" stroke-width="1" opacity="0.3"/>\');}',
'for(var m=0;m<3;m++){var mb=hor-40+m*46,ma=ri(90,190),LS=ri(90,160),mo=ri(0,255),mp=\'0,\'+H;',
' for(var mx=0;mx<=W;mx+=25){var u=((mx%LS)*10000/LS)|0,i2=((mx/LS)|0)+mo;',
'  var my=mb-((ma*l2(i2,m+31,u,5000))/10000|0);mp+=\' \'+mx+\',\'+my;}',
' mp+=\' \'+W+\',\'+H;out.push(\'<polygon points="\'+mp+\'" fill="\'+hexc(ri(20,60))+\'" opacity="0.9"/>\');}',
'for(var ly=hor;ly<H;ly+=24){out.push(\'<rect x="0" y="\'+ly+\'" width="\'+W+\'" height="24" fill="\'+hexc(18+(((ly-hor)*140/(H-hor))|0))+\'"/>\');}',
'for(var ds=0;ds<110;ds++){out.push(\'<rect x="\'+ri(0,W-160)+\'" y="\'+ri(hor+10,H-10)+\'" width="\'+ri(24,150)+\'" height="2" fill="\'+hexc(ri(140,215))+\'" opacity="0.\'+ri(8,22)+\'"/>\');}',
'var TS=ri(52,64),cy0=hor-ri(150,210),towers=[];',
'for(var gx=-4;gx<=4;gx++)for(var gy=-4;gy<=4;gy++){if((gx*gx+gy*gy)>18)continue;',
' var hh=ri(40,150)+(22-(gx*gx+gy*gy))*3;if(chance(18))hh+=ri(60,120);towers.push([gx,gy,hh]);}',
'towers.sort(function(a,b){return (a[0]+a[1])-(b[0]+b[1]);});',
'for(var t=0;t<towers.length;t++){var g1=towers[t][0],g2=towers[t][1],h2=towers[t][2];',
' var px=CX+(g1-g2)*TS,py=cy0+((g1+g2)*TS>>1)-h2;',
' out.push(\'<polygon points="\'+px+\',\'+py+\' \'+(px+TS)+\',\'+(py+(TS>>1))+\' \'+px+\',\'+(py+TS)+\' \'+(px-TS)+\',\'+(py+(TS>>1))+\'" fill="\'+hexc(ri(210,235))+\'"/>\');',
' out.push(\'<polygon points="\'+(px-TS)+\',\'+(py+(TS>>1))+\' \'+px+\',\'+(py+TS)+\' \'+px+\',\'+(py+TS+h2)+\' \'+(px-TS)+\',\'+(py+(TS>>1)+h2)+\'" fill="\'+hexc(ri(150,175))+\'"/>\');',
' out.push(\'<polygon points="\'+px+\',\'+(py+TS)+\' \'+(px+TS)+\',\'+(py+(TS>>1))+\' \'+(px+TS)+\',\'+(py+(TS>>1)+h2)+\' \'+px+\',\'+(py+TS+h2)+\'" fill="\'+hexc(ri(90,115))+\'"/>\');',
' for(var wn=0;wn<5;wn++){if(!chance(55))continue;var side=chance(50)?1:-1;',
'  out.push(\'<rect x="\'+(px+side*(TS>>1)-(side>0?6:2))+\'" y="\'+(py+TS+ri(6,Math.max(7,h2-8)))+\'" width="4" height="6" fill="\'+hexc(ri(40,58))+\'" opacity="0.9"/>\');}',
' if(h2>200&&chance(40)){out.push(\'<line x1="\'+px+\'" y1="\'+py+\'" x2="\'+px+\'" y2="\'+(py-ri(20,46))+\'" stroke="\'+hexc(200)+\'" stroke-width="2"/>\');}}',
'for(var b=0;b<towers.length-1;b++){if(!chance(12))continue;var A=towers[b],B=towers[b+1];',
' out.push(\'<line x1="\'+(CX+(A[0]-A[1])*TS)+\'" y1="\'+(cy0+((A[0]+A[1])*TS>>1)-A[2])+\'" x2="\'+(CX+(B[0]-B[1])*TS)+\'" y2="\'+(cy0+((B[0]+B[1])*TS>>1)-B[2])+\'" stroke="\'+hexc(190)+\'" stroke-width="2" opacity="0.6"/>\');}',
'var coreY=cy0-ri(40,80);',
'for(var gr=10;gr>0;gr--){out.push(\'<circle cx="\'+CX+\'" cy="\'+coreY+\'" r="\'+(gr*ri(14,18))+\'" fill="none" stroke="\'+hexc(ri(160,190))+\'" stroke-width="2" opacity="0.\'+(4+gr)+\'"/>\');}',
'for(var sp=0;sp<12;sp++){var an=(sp*P/12)|0,rl=ri(90,130);',
' out.push(\'<line x1="\'+(CX+mul(rl,cos(an)))+\'" y1="\'+(coreY+mul(rl,sin(an)))+\'" x2="\'+(CX-mul(rl,cos(an)))+\'" y2="\'+(coreY-mul(rl,sin(an)))+\'" stroke="\'+hexc(175)+\'" stroke-width="1" opacity="0.4"/>\');}',
'for(var pp=0;pp<24;pp++){var a0=(pp*P/24)|0,r1=ri(200,240),r2=r1+ri(40,80),pt=\'\';',
' for(var e=0;e<8;e++){var ae=a0+((e*P/96)|0),rr=(e<4)?r2:r1;',
'  pt+=(e?\' \':\'\')+(CX+mul(rr,cos(ae)))+\',\'+(coreY+mul(rr,sin(ae)));}',
' out.push(\'<polygon points="\'+pt+\'" fill="\'+hexc(ri(150,185))+\'" opacity="0.10"/>\');}',
'function branch(bx,by,ang,len,dep){if(dep<=0||len<8)return;',
' var ex=bx+mul(len,cos(ang)),ey=by+mul(len,sin(ang));',
' out.push(\'<line x1="\'+bx+\'" y1="\'+by+\'" x2="\'+ex+\'" y2="\'+ey+\'" stroke="\'+hexc(ri(60,95))+\'" stroke-width="\'+dep+\'" opacity="0.8"/>\');',
' branch(ex,ey,ang+ri(300,700),(len*7)/10|0,dep-1);branch(ex,ey,ang-ri(300,700),(len*6)/10|0,dep-1);}',
'branch(ri(120,300),H-30,-ri(900,1100),ri(90,130),5);',
'branch(W-ri(120,300),H-30,-ri(900,1100),ri(90,130),5);',
'for(var mo=0;mo<80;mo++){out.push(\'<circle cx="\'+ri(0,W)+\'" cy="\'+ri(hor-300,H)+\'" r="\'+ri(2,6)+\'" fill="\'+hexc(ri(190,235))+\'" opacity="0.\'+ri(10,30)+\'"/>\');}',
'out.push(\'<rect x="14" y="14" width="\'+(W-28)+\'" height="\'+(H-28)+\'" fill="none" stroke="\'+hexc(170)+\'" stroke-width="3" opacity="0.7"/>\');',
'for(var cn=0;cn<4;cn++){var cxn=cn%2?W-40:40,cyn=cn<2?40:H-40;',
' out.push(\'<path d="M\'+cxn+\' \'+(cyn+(cn<2?26:-26))+\'V\'+cyn+\'H\'+(cxn+(cn%2?-26:26))+\'" fill="none" stroke="\'+hexc(185)+\'" stroke-width="5"/>\');}',
'var sig=\'\';for(var si=0;si<6;si++){var a1=(si*P/6)|0,a2=(((si+2)%6)*P/6)|0;',
' sig+=\'<line x1="\'+(CX+mul(56,cos(a1)))+\'" y1="\'+(H-90+mul(56,sin(a1)))+\'" x2="\'+(CX+mul(56,cos(a2)))+\'" y2="\'+(H-90+mul(56,sin(a2)))+\'" stroke="\'+hexc(175)+\'" stroke-width="2" opacity="0.8"/>\';}',
'out.push(sig);',
'out.push(\'<text x="\'+CX+\'" y="\'+(H-24)+\'" font-family="monospace" font-size="22" fill="\'+hexc(200)+\'" text-anchor="middle" opacity="0.85">RELIKS TITAN :: \'+serial+\'</text>\');',
'return \'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 \'+W+\' \'+H+\'">\'+out.join(\'\')+\'</svg>\';',
'}'
].join('\n');

function build(E) {
  const sin = [];
  for (let k = 0; k < E; k++) sin.push(Math.round(10000 * Math.sin(2 * Math.PI * k / E)));
  return TEMPLATE
    .replace('__SIN__', '[' + sin.join(',') + ']')
    .replace('__PAL__', '[' + PAL.map(s => '"' + s + '"').join(',') + ']')
    .replace('__PERM__', '[' + PERM.join(',') + ']');
}

let E = 4096, chosen = null;
for (let it = 0; it < 24; it++) {
  const src = build(E), len = Buffer.byteLength(src, 'utf8');
  if (len <= CAP) chosen = src;
  if (len <= CAP && CAP - len < 128) break;
  if (len > CAP) E = Math.max(1024, E - Math.ceil((len - CAP + 128) / 6));
  else E = Math.min(16384, E + Math.floor((CAP - 128 - len) / 6));
}
if (!chosen || Buffer.byteLength(chosen, 'utf8') > CAP) { console.error('cap fit failed'); process.exit(1); }

const mod = [
"const { blake2b } = require('@noble/hashes/blake2b');",
"const B = Buffer;",
"const ENGINE_SRC = " + JSON.stringify(chosen) + ";",
"const TEST_SERIAL = 1;",
"function seedLanes(serial){const le=B.alloc(8);le.writeBigUInt64LE(BigInt(serial));const h=blake2b(B.concat([B.from('ReliksSeedV10','utf8'),le]),{dkLen:32});const dv=new DataView(h.buffer,h.byteOffset,h.byteLength);const lanes=[];for(let i=0;i<8;i++)lanes.push(dv.getInt32(i*4,true));return lanes;}",
"const compiled=new Function('L','serial',ENGINE_SRC+'\\nreturn reliks(L,serial);');",
"function render(serial){const s=Number(BigInt(serial)&0xFFFFFFFFn);return compiled(seedLanes(s),s|0);}",
"const engineHashHex=B.from(blake2b(B.from(ENGINE_SRC,'utf8'),{dkLen:32})).toString('hex');",
"const renderHashHex=B.from(blake2b(B.from(render(TEST_SERIAL),'utf8'),{dkLen:32})).toString('hex');",
"module.exports={ENGINE_SRC,seedLanes,render,engineHashHex,renderHashHex,TEST_SERIAL};"
].join('\n');
fs.writeFileSync('reliks-engine-titan.js', mod);
console.log('reliks-engine-titan.js written | ENGINE_SRC', Buffer.byteLength(chosen, 'utf8'), '/', CAP, 'B | sine LUT entries', E);
console.log('engine_hash', require('./reliks-engine-titan.js').engineHashHex);
