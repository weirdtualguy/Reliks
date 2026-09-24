(function(){
var editor=document.getElementById('ed');
var serialEl=document.getElementById('ser');
var prev=document.getElementById('prev');
var gatesEl=document.getElementById('gates');
var hashEl=document.getElementById('hashes');
var statusEl=document.getElementById('status');
var tplSel=document.getElementById('tpl');
var walletBtn=document.getElementById('wallet-btn');
var walletStatus=document.getElementById('wallet-status');

function enc(s){return new TextEncoder().encode(s);}
function blen(s){return enc(s).length;}
function hx(b){var s='';for(var i=0;i<b.length;i++)s+=('0'+b[i].toString(16)).slice(-2);return s;}
function bh(s){return hx(ReliksBlake2b.blake2b(enc(s),32));}
function cat(a){var n=0,i;for(i=0;i<a.length;i++)n+=a[i].length;var o=new Uint8Array(n),p=0;for(i=0;i<a.length;i++){o.set(a[i],p);p+=a[i].length;}return o;}
function seedLanes(serial){var le=new Uint8Array(8);new DataView(le.buffer).setBigUint64(0,BigInt(serial),true);var h=ReliksBlake2b.blake2b(cat([enc('ReliksSeedV10'),le]),32);var dv=new DataView(h.buffer,h.byteOffset,h.byteLength);var o=[];for(var i=0;i<8;i++)o.push(dv.getInt32(i*4,true));return o;}
function seed32(s){return Number(BigInt(s)&0xFFFFFFFFn);}
// compile: replaced by worker-based renderAtAsync
function liveSrc(){return PRELUDE+'\n'+editor.value;}
function renderAtAsync(serialStr){
  return new Promise(function(resolve, reject){
    var s=seed32(serialStr);
    var lanes=seedLanes(s);
    var src=liveSrc();
    var workerCode='self.onmessage=function(e){var fn=new Function("L","serial",e.data.engine+"\\nreturn reliks(L,serial);");try{var svg=fn(e.data.lanes,e.data.serial);self.postMessage({svg:svg});}catch(e){self.postMessage({error:e.message});}};';
    var blob=new Blob([workerCode],{type:'application/javascript'});
    var worker=new Worker(URL.createObjectURL(blob));
    var timeout=setTimeout(function(){worker.terminate();reject(new Error('Engine execution timed out (5s). Possible infinite loop.'));},5000);
    worker.onmessage=function(e){clearTimeout(timeout);worker.terminate();if(e.data.error)reject(new Error(e.data.error));else resolve(e.data.svg);};
    worker.postMessage({engine:src,lanes:lanes,serial:s|0});
  });
}

var BANNED=[
[/\bMath\s*\.\s*(random|sin|cos|tan|asin|acos|atan2?|pow|sqrt|hypot|exp|log2?|log10)\b/,'Math transcendental/random'],
[/\bDate\b/,'Date'],[/\bperformance\b/,'performance'],[/\bfetch\s*\(/,'fetch'],
[/\bXMLHttpRequest\b/,'XHR'],[/\bWebSocket\b/,'WebSocket'],[/\brequire\s*\(/,'require'],
[/\bimport\s*[\(\{]/,'import'],[/\beval\s*\(/,'eval'],[/new\s+Function/,'new Function'],
[/\bwindow\b/,'window'],[/\bdocument\b/,'document'],[/\blocalStorage\b/,'localStorage'],
[/\bsetTimeout\b|\bsetInterval\b/,'timer'],[/\bprocess\b/,'process'],[/\bglobalThis\b/,'globalThis']];

async function runGatesAsync(){
  var src=liveSrc(),out=[],ok=true;
  function chk(name,pass,info){out.push((pass?'PASS ':'FAIL ')+name+(info?' | '+info:''));if(!pass)ok=false;}
  chk('L1 size <= cap',blen(src)<=CAP,blen(src)+'/'+CAP+' B (incl. prelude '+PRELUDE.length+' B)');
  var bad=[],i;for(i=0;i<BANNED.length;i++){if(src.match(BANNED[i][0]))bad.push(BANNED[i][1]);}
  chk('L2 no banned constructs',bad.length===0,bad.join(','));
  var a=null,b=null,c=null,err='';
  try{a=await renderAtAsync('42');b=await renderAtAsync('42');c=await renderAtAsync('42');}catch(e){err=e.message;}
  chk('L3 determinism x3',err===''&&a===b&&b===c,err);
  var svgOk=false,serr='';
  try{svgOk=!!a&&a.indexOf('<svg')===0&&a.indexOf('xmlns=')>-1&&a.slice(-6)==='</svg>'&&!/NaN|undefined|Infinity|null/.test(a);if(!svgOk)serr='malformed svg';}catch(e){serr=e.message;}
  chk('L8 svg well-formed',svgOk,serr);
  var conv=false;try{var r7=await renderAtAsync('7');var r4294967303=await renderAtAsync('4294967303');conv=(r7===r4294967303);}catch(e){conv=false;}
  chk('L5 seed mod 2^32 convention',conv);
  gatesEl.textContent=out.join('\n');
  statusEl.textContent=(ok?'GATES GREEN':'GATES FAILED')+' | '+(ok?'cleared for export':'fix failures before export');
  return ok;
}

async function show(){
  var serial=serialEl.value.trim()||'1';var svg='';
  try{svg=await renderAtAsync(serial);}catch(e){statusEl.textContent='ERROR: '+e.message;return;}
  prev.srcdoc='<!doctype html><html><head><meta charset=utf-8><style>html,body{margin:0;height:100%;background:#000}svg{display:block;width:100vw;height:100vh}</style></head><body>'+svg+'</body></html>';
  var src=liveSrc();
  hashEl.textContent='engine_hash '+bh(src)+'\nrender_hash '+bh(svg)+'\nengine_bytes '+blen(src)+' / '+CAP;
  statusEl.textContent='rendered serial '+serial+' | svg '+svg.length+' bytes';
  await runGatesAsync();
}

function download(fn,text){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));a.download=fn;a.click();}

function exportEngine(){
  var name=(document.getElementById('name').value||'reliks-engine').replace(/[^a-z0-9-]/gi,'');
  var src=liveSrc();
  var lines=[
    "const { blake2b } = require('@noble/hashes/blake2b');",
    "const B = Buffer;",
    "const ENGINE_SRC = "+JSON.stringify(src)+";",
    "const TEST_SERIAL = 1;",
    "function seedLanes(serial){const le=B.alloc(8);le.writeBigUInt64LE(BigInt(serial));const h=blake2b(B.concat([B.from('ReliksSeedV10','utf8'),le]),{dkLen:32});const dv=new DataView(h.buffer,h.byteOffset,h.byteLength);const lanes=[];for(let i=0;i<8;i++)lanes.push(dv.getInt32(i*4,true));return lanes;}",
    "const compiled=new Function('L','serial',ENGINE_SRC+'\\nreturn reliks(L,serial);');",
    "function render(serial){const s=Number(BigInt(serial)&0xFFFFFFFFn);return compiled(seedLanes(s),s|0);}",
    "const engineHashHex=B.from(blake2b(B.from(ENGINE_SRC,'utf8'),{dkLen:32})).toString('hex');",
    "const renderHashHex=B.from(blake2b(B.from(render(TEST_SERIAL),'utf8'),{dkLen:32})).toString('hex');",
    "module.exports={ENGINE_SRC,seedLanes,render,engineHashHex,renderHashHex,TEST_SERIAL};"
  ];
  download(name+'.js',lines.join('\n')+'\n');
  statusEl.textContent='exported '+name+'.js | next: node reliks-lens.js '+name+'.js';
}

function exportSeries(){
  var name=(document.getElementById('name').value||'reliks-engine').replace(/[^a-z0-9-]/gi,'');
  var artistPubkey = ReliksWallet.isConnected() ? ReliksWallet.getPubkey() : '<64-hex artist pubkey>';
  var series={artist:artistPubkey,price:100000000,royalty_bips:500,mints_left:8,treasury:'<64-hex treasury pubkey>'};
  if (artistPubkey === '<64-hex artist pubkey>') {
    statusEl.textContent='exported series-'+name+'.json | WARNING: wallet not connected; fill artist/treasury pubkeys manually';
  } else {
    statusEl.textContent='exported series-'+name+'.json | artist pubkey auto-filled from Kaspire; fill treasury pubkey';
  }
  download('series-'+name+'.json',JSON.stringify(series,null,2)+'\n');
}

function updateWalletUI() {
  if (ReliksWallet.isConnected()) {
    walletBtn.textContent = 'Disconnect Kaspire';
    var addr = ReliksWallet.getAddress() || '';
    var shortAddr = addr.length > 12 ? addr.slice(0, 12) + '...' : addr;
    walletStatus.textContent = 'Connected: ' + shortAddr;
    walletStatus.className = 'wallet-connected';
  } else {
    walletBtn.textContent = 'Connect Kaspire';
    walletStatus.textContent = window.SignClient ? 'Ready' : 'Loading WalletConnect...';
    walletStatus.className = 'wallet-disconnected';
  }
}
window.updateWalletUI = updateWalletUI;

walletBtn.onclick = async function() {
  if (ReliksWallet.isConnected()) {
    ReliksWallet.disconnect();
  } else {
    walletBtn.disabled = true;
    walletBtn.textContent = 'Connecting...';
    var ok = await ReliksWallet.connect();
    walletBtn.disabled = false;
    if (!ok) updateWalletUI();
  }
};

document.getElementById('load').onclick=function(){editor.value=TEMPLATES[tplSel.value]||TEMPLATES.circles;show();};
document.getElementById('go').onclick=show;
document.getElementById('rnd').onclick=function(){serialEl.value=String(Math.floor(Math.random()*4294967296));show();};
document.getElementById('gates').onclick=function(){runGates();};
document.getElementById('exe').onclick=exportEngine;
document.getElementById('exs').onclick=exportSeries;
editor.value=TEMPLATES.circles;
show();
updateWalletUI();
ReliksWallet.init().then(updateWalletUI);
window.addEventListener('signclient-loaded', updateWalletUI);
})();
