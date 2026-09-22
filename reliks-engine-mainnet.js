const { blake2b } = require('@noble/hashes/blake2b');
const B = Buffer;
// "Reliks Genesis City v3" - dense isometric BlockDAG metropolis.
// Integer-only; R=13 packed grid, plaza pads, 4 canals, teal/cream/charcoal.
const ENGINE_SRC = `
function reliks(L,serial){
var x=(L[0]^serial)|0,y=L[1]|0,z=L[2]|0,w=L[3]|0;
function rnd(){var t=(x^(x<<11))|0;x=y;y=z;z=w;w=(w^(w>>>19))^(t^(t>>>8));return w>>>0;}
function ri(a,b){return a+(rnd()%(b-a+1));}
var W=1600,CX=800,CY=770,A=36,B=18,Z=22,R=13,i,j,k,s,h,x,y,d,o=[],wat={},wpts=[];
function IX(i,j){return CX+(i-j)*A;}
function IY(i,j){return CY+(i+j-R)*B;}
function dia(x,y){return 'M'+x+' '+y+'l'+A+' '+B+'l'+-A+' '+B+'l'+-A+' '+-B+'z';}
function pl(p,wd,col,op){var q='M'+p[0][0]+' '+p[0][1];for(var v=1;v<p.length;v++)q+='L'+p[v][0]+' '+p[v][1];return '<path d="'+q+'" fill="none" stroke="'+col+'" stroke-width="'+wd+'"'+(op?' opacity="'+op+'"':'')+'/>';}
o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1600"><defs><radialGradient id="g"><stop offset="0" stop-color="#ffd9a0"/><stop offset=".3" stop-color="#e8923a" stop-opacity=".8"/><stop offset="1" stop-color="#e8923a" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="1600" fill="#e7dfc8"/>');
o.push('<g stroke="#d3c9ab" opacity=".5">');
for(i=0;i<150;i++){x=ri(60,1540);y=ri(60,1540);k=ri(30,130);o.push('<line x1="'+x+'" y1="'+y+'" x2="'+(x+k)+'" y2="'+(y+(k/2|0))+'"/>');}
o.push('</g><g stroke="#cfc5a8" opacity=".55">');
for(i=0;i<=R;i++){o.push('<line x1="'+IX(i,0)+'" y1="'+IY(i,0)+'" x2="'+IX(i,R)+'" y2="'+IY(i,R)+'"/><line x1="'+IX(0,i)+'" y1="'+IY(0,i)+'" x2="'+IX(R,i)+'" y2="'+IY(R,i)+'"/>');}
o.push('</g>');
var c,pts,wi,wj;
for(c=0;c<4;c++){wi=c%2?ri(2,R-2):0;wj=c%2?0:ri(2,R-2);pts=[[IX(wi,wj),IY(wi,wj)]];wat[wi+'_'+wj]=1;wpts.push([IX(wi,wj),IY(wi,wj)]);
while(wi<R&&wj<R){if(rnd()%2)wi++;else wj++;wat[wi+'_'+wj]=1;pts.push([IX(wi,wj),IY(wi,wj)]);wpts.push([IX(wi,wj),IY(wi,wj)]);}
o.push(pl(pts,30,'#2f2f28',0)+pl(pts,22,'#49c5b1',0)+pl(pts,6,'#bfeee2','.85'));}
for(s=0;s<=2*R;s++){for(i=s-R>0?s-R:0;i<=R&&i<=s;i++){j=s-i;
if(wat[i+'_'+j])continue;
var t=rnd()%10;if(t<1){o.push('<path d="'+dia(IX(i,j),IY(i,j))+'" fill="#ddd4ba"/>');continue;}
h=t>7?ri(6,9):ri(2,5);
var dk=t%3,top,lf,rf;
if(dk==0){top='#4b4a3f';lf='#34332b';rf='#26251e';}else if(dk==1){top='#f0e9d3';lf='#d8cfb3';rf='#bfb598';}else{top='#49c5b1';lf='#2e8f85';rf='#1f6b64';}
x=IX(i,j);y=IY(i,j)-h*Z;d=h*Z;
o.push('<path d="'+dia(x,y)+'" fill="'+top+'"/><path d="M'+(x-A)+' '+(y+B)+'l'+A+' '+B+'v'+d+'l'+-A+' '+-B+'z" fill="'+lf+'"/><path d="M'+(x+A)+' '+(y+B)+'l'+-A+' '+B+'v'+d+'l'+A+' '+-B+'z" fill="'+rf+'"/>');
if(h>=2){var wn=h>3?3:2;for(k=0;k<wn;k++){o.push('<path d="M'+(x-A+6+k*10)+' '+(y+B+6)+'l7 4v11l-7 -4z" fill="'+(dk==1?'#34332b':'#8fe8d8')+'"'+(dk==1?'':' opacity=".9"')+'/>');}}
if(h>=6){o.push('<path d="M'+(x+6)+' '+(y+B+d-24)+'v-11q10 -12 20 0v11z" fill="'+(dk==1?'#26251e':'#123c36')+'"/>');
var ah=ri(18,42);o.push('<line x1="'+x+'" y1="'+(y+B)+'" x2="'+x+'" y2="'+(y+B-ah)+'" stroke="#26251e" stroke-width="3"/><circle cx="'+x+'" cy="'+(y+B-ah)+'" r="3" fill="#49c5b1"/>');}
if(t==6||t==7){var di=rnd()%2,dj=di?0:1,n=ri(4,7);
for(k=1;k<=n;k++){var e2=h*Z-k*13,qx=IX(i+di*k,j+dj*k),qy=IY(i+di*k,j+dj*k)-(e2>0?e2:0);
o.push('<path d="'+dia(qx,qy)+'" fill="#efe8d2"/><path d="M'+(qx-A)+' '+(qy+B)+'l'+A+' '+B+'v13l'+-A+' '+-B+'z" fill="#34332b"/>');}}
}}
o.push('<g>');
for(k=0;k<wpts.length;k++){if(rnd()%3==0){var bx=wpts[k][0]+(rnd()%2?26:-26),by=wpts[k][1]+8;o.push('<circle cx="'+bx+'" cy="'+by+'" r="9" fill="#49c5b1" opacity=".22"/><circle cx="'+bx+'" cy="'+by+'" r="3" fill="#bfeee2"/>');}}
o.push('</g>');
var m=R/2|0,gx=IX(m,m),gy=IY(m,m)-ri(2,4)*Z;
o.push('<circle cx="'+gx+'" cy="'+gy+'" r="110" fill="url(#g)"/><circle cx="'+gx+'" cy="'+gy+'" r="9" fill="#fff"/>');
for(k=14;k<=42;k+=7)o.push('<circle cx="'+gx+'" cy="'+gy+'" r="'+k+'" fill="none" stroke="'+(k>34?'#49c5b1':'#e8923a')+'" stroke-width="2" opacity=".75"/>');
o.push('<rect x="36" y="36" width="1528" height="1528" fill="none" stroke="#3a3a33" stroke-width="7"/></svg>');
return o.join('');
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
  else process.stdout.write(render(parseInt(cmd || '1', 10)));
}
