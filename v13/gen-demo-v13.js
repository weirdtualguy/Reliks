'use strict';
const fs = require('fs'), path = require('path');
const V = require(path.resolve('reliks-lib.js'));
const R = require(path.resolve('v13/vm/rvm.js'));
const BL = require(path.resolve('web/blake2b.js'));
const b2 = u => BL.blake2b(u, 32);
const hx = u => Buffer.from(u).toString('hex');
const die = m => { console.error('FAIL: ' + m); process.exit(1); };
const LD = JSON.parse(fs.readFileSync(process.env.RELIKS_LEDGER || 'v13/ledger-vm-v13.json', 'utf8'));
const F = V.parts(JSON.parse(fs.readFileSync(process.env.RELIKS_FACTORY_ABI || 'v13/out/factory-vm-v13.json', 'utf8')));
if (Number(LD.series.engine_lang) !== 1) die('series engine_lang is not 1');

function findProgram(bytecode, wantHash) {
  for (let i = 0; i < bytecode.length; i++) {
    const op = bytecode[i]; let n, s;
    if (op >= 1 && op <= 75) { n = op; s = i + 1; }
    else if (op === 0x4c && i + 1 < bytecode.length) { n = bytecode[i + 1]; s = i + 2; }
    else if (op === 0x4d && i + 2 < bytecode.length) { n = bytecode.readUInt16LE(i + 1); s = i + 3; }
    else continue;
    if (n > 100 && s + n <= bytecode.length && hx(b2(new Uint8Array(bytecode.subarray(s, s + n)))) === wantHash) return bytecode.subarray(s, s + n);
  }
  return null;
}
const prog = findProgram(F.bc, LD.series.program_hash);
if (!prog) die('program not found in factory template');

const eds = LD.editions.map(e => ({ serial: String(e.serial), lineage: e.lineage, sales: Number(e.sales), owner: e.owner, price: Number(e.price), cov: e.cov }));
eds.forEach((e, i) => {
  const hi = R.hostInputs(b2, e.serial, new Uint8Array(Buffer.from(e.lineage, 'hex')), e.sales);
  const svg = R.render(new Uint8Array(prog), hi.lanes, hi.serial32, hi.pat, hi.wear);
  console.log('edition ' + i + ' node render: sales ' + e.sales + ' wear ' + hi.wear + ' pat ' + hi.pat + ' hash ' + hx(b2(new Uint8Array(Buffer.from(svg, 'ascii')))));
});

const safe = s => s.replace(/<\/script/gi, '<\\/script');
const DEMO = { prog: hx(prog), programHash: LD.series.program_hash, royaltyBips: Number(LD.series.royalty_bips), editions: eds };
const client = `
(function(){
var D=window.DEMO,B=ReliksBlake2b.blake2b,prog=u8(D.prog);
function u8(h){var o=new Uint8Array(h.length/2);for(var i=0;i<o.length;i++)o[i]=parseInt(h.substr(i*2,2),16);return o;}
function hex(u){var s='';for(var i=0;i<u.length;i++)s+=('0'+u[i].toString(16)).slice(-2);return s;}
function cat(a){var n=0,i;for(i=0;i<a.length;i++)n+=a[i].length;var o=new Uint8Array(n),p=0;for(i=0;i<a.length;i++){o.set(a[i],p);p+=a[i].length;}return o;}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e;}
function short(s){return s.slice(0,10)+'…'+s.slice(-6);}
function draw(ed,sales,lin){var hi=RVM.hostInputs(B,ed.serial,lin,sales);return {svg:RVM.render(prog,hi.lanes,hi.serial32,hi.pat,hi.wear),pat:hi.pat,wear:hi.wear};}
var ok=hex(B(prog,32))===D.programHash;
var st=document.getElementById('st');st.textContent=ok?('Program '+prog.length+' B hashes to the series program_hash '+short(D.programHash)):'PROGRAM HASH MISMATCH: art withheld';st.className=ok?'ok':'bad';
if(!ok)return;
var host=document.getElementById('host');
D.editions.forEach(function(ed,i){
  var lin0=u8(ed.lineage),lin=lin0,sales=ed.sales,sim=0;
  var card=el('article','card'),img=el('img','art'),meta=el('dl','meta'),note=el('p','note');
  var rng=el('input');rng.type='range';rng.min=0;rng.max=255;
  var bSim=el('button','btn','Simulate a sale (off-chain)'),bReset=el('button','btn ghost','Reset to chain state');
  function show(){
    try{var r=draw(ed,sales,lin);img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(r.svg);
      meta.textContent='';
      [['Edition','#'+i+'  serial '+ed.serial],['Sales',String(sales)+(sim?'  ('+sim+' simulated)':'  (on chain)')],['Wear',String(r.wear)+' / 255'],['Patina',String(r.pat)],['Lineage',short(hex(lin))],['Owner',short(ed.owner)]].forEach(function(kv){var d=el('div');d.appendChild(el('dt','',kv[0]));d.appendChild(el('dd','',kv[1]));meta.appendChild(d);});
      rng.value=Math.min(sales,255);note.textContent='';
    }catch(e){note.textContent='Render failed: '+(e.code||e.message);}
  }
  rng.addEventListener('input',function(){sales=Number(rng.value);show();});
  bSim.addEventListener('click',function(){var o=new Uint8Array(32);crypto.getRandomValues(o);lin=B(cat([new TextEncoder().encode('ReliksLineageV2'),lin,o]),32);sales++;sim++;show();});
  bReset.addEventListener('click',function(){lin=lin0;sales=ed.sales;sim=0;show();});
  card.appendChild(img);card.appendChild(meta);
  var row=el('div','row');row.appendChild(el('label','','Wear preview'));row.appendChild(rng);card.appendChild(row);
  var row2=el('div','row');row2.appendChild(bSim);row2.appendChild(bReset);card.appendChild(row2);card.appendChild(note);
  host.appendChild(card);show();
});
})();`;
const css = 'body{margin:0;background:#06080b;color:#e7dfc8;font:15px system-ui,sans-serif}main{max-width:560px;margin:0 auto;padding:16px}h1{font-size:20px;margin:8px 0}.ok{color:#49c5b1}.bad{color:#e55}.note{color:#e55;font-size:13px}.small{color:#8a8f98;font-size:13px}.card{background:#0d1117;border:1px solid #1e2530;border-radius:12px;padding:12px;margin:14px 0}.art{width:100%;aspect-ratio:1;background:#000;border-radius:8px;display:block}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin:10px 0}.meta div{display:flex;gap:6px}dt{color:#8a8f98}dd{margin:0}.row{display:flex;gap:8px;align-items:center;margin:8px 0}.row input{flex:1}.btn{background:#49c5b1;color:#06080b;border:0;border-radius:8px;padding:9px 12px;font-weight:600}.btn.ghost{background:#1e2530;color:#e7dfc8}';
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reliks v13 demo (testnet)</title><style>' + css + '</style></head><body><main><h1>Reliks v13: living editions (testnet-10)</h1><p class="small">Snapshot of the testnet ledger, rendered in your browser by the Reliks-VM. Simulated sales are off-chain. On-chain commitment checks still run in verify-vm-render.js.</p><p id="st">Checking program…</p><div id="host"></div></main>' +
  '<script>window.DEMO=' + safe(JSON.stringify(DEMO)) + ';</script>' +
  '<script>' + safe(fs.readFileSync('web/blake2b.js', 'utf8')) + '</script>' +
  '<script>var RVM=(function(){var module={exports:{}};' + safe(fs.readFileSync('v13/vm/rvm.js', 'utf8')) + '\nreturn module.exports;})();</script>' +
  '<script>' + safe(client) + '</script></body></html>';
const OUT = process.env.DEMO_OUT || 'v13/demo-v13.html';
fs.writeFileSync(OUT, html);
console.log(OUT + ' written (' + html.length + ' bytes)');
