#!/usr/bin/env node
// Relik file: ONE edition as a single self-contained HTML file (program bytes, claimed state, hash check, renderer). No network.
// node tools/make-relik.js <ledger.json> <factory-abi.json> <editionIndex> [outdir]
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const hx = u => Buffer.from(u).toString('hex');
const safe = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const R = require('../v13/vm/rvm.js');
const b2 = u => require('../web/blake2b.js').blake2b(u, 32);
const die = m => { console.error('FATAL: ' + m); process.exit(1); };

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

const CSS = 'body{margin:0;background:#06080b;color:#e7dfc8;font:15px system-ui,sans-serif}main{max-width:560px;margin:0 auto;padding:16px}h1{font-size:20px;margin:8px 0}.ok{color:#49c5b1}.bad{color:#ff6b6b}.small{color:#8a8f98;font-size:13px}#art{width:100%;aspect-ratio:1;background:#000;border-radius:10px;display:block}#meta{margin:12px 0}#meta div{display:flex;gap:10px;padding:4px 0;border-top:1px solid #1e2530}#meta dt{color:#8a8f98;min-width:96px}#meta dd{margin:0;word-break:break-all}.row{display:flex;gap:8px;align-items:center;margin:10px 0;flex-wrap:wrap}.row input{flex:1;min-width:120px}.btn{background:#49c5b1;color:#06080b;border:0;border-radius:8px;padding:9px 12px;font-weight:600;font-size:15px}.btn.ghost{background:#1e2530;color:#e7dfc8}details{margin:10px 0}pre{background:#0d1117;border:1px solid #1e2530;border-radius:8px;padding:10px;overflow-x:auto;font-size:12px;white-space:pre-wrap;word-break:break-all}';

const CLIENT = `
(function(){
var D=window.RELIK,B=ReliksBlake2b.blake2b,E=D.edition,S=D.series;
function u8(h){var o=new Uint8Array(h.length/2);for(var i=0;i<o.length;i++)o[i]=parseInt(h.substr(i*2,2),16);return o;}
function hex(u){var s='';for(var i=0;i<u.length;i++)s+=('0'+u[i].toString(16)).slice(-2);return s;}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e;}
function short(s){s=String(s||'');return s.length>20?s.slice(0,10)+'\\u2026'+s.slice(-6):(s||'n/a');}
var $=function(id){return document.getElementById(id);};
var st=$('st'),img=$('art'),meta=$('meta'),note=$('note'),rng=$('rng'),rv=$('rv');
var prog=u8(D.prog),lin=u8(E.lineage),cur=null;
function render(sales){var hi=RVM.hostInputs(B,E.serial,lin,sales);var svg=RVM.render(prog,hi.lanes,hi.serial32,hi.pat,hi.wear);return {svg:svg,pat:hi.pat,wear:hi.wear};}
function paint(r){img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(r.svg);img.hidden=false;cur=r;}
function row(k,v){var d=el('div');d.appendChild(el('dt','',k));d.appendChild(el('dd','',v));meta.appendChild(d);}
var r0;
try{
  if(hex(B(prog,32))!==S.programHash)throw new Error('PROGRAM HASH MISMATCH');
  r0=render(E.sales);
  if(hex(B(new TextEncoder().encode(r0.svg),32))!==D.renderHash)throw new Error('RENDER HASH MISMATCH');
  paint(r0);
  st.textContent='Checked in this file: the '+prog.length+' B program hashes to the series program_hash, and the art at the claimed state matches the embedded render hash. NOT checked here: that this state is the live state on chain.';
  st.className='small ok';
  row('Serial',E.serial);row('Sales / wear',E.sales+' / '+r0.wear+' of 255');row('Patina',r0.pat+' of 63');
  row('Lineage',short(E.lineage));row('Owner',short(E.owner));row('Price',E.price?(E.price/1e8)+' KAS (listed)':'not listed');
  row('Artist',short(S.artist));row('Royalty',(S.royaltyBips/100)+'%');row('Network',D.network);row('State as of',D.asOf||'n/a');
  row('Program hash',short(S.programHash));row('Render hash',short(D.renderHash));
}catch(e){st.textContent=(e.code||e.message)+': art withheld';st.className='bad';return;}
rng.value=Math.min(E.sales,255);rv.textContent='(claimed state)';
rng.addEventListener('input',function(){var w=Number(rng.value);try{paint(render(w));rv.textContent=w===Math.min(E.sales,255)?'(claimed state)':'(preview '+w+')';}catch(e){note.textContent='Render failed: '+(e.code||e.message);}});
$('reset').addEventListener('click',function(){rng.value=Math.min(E.sales,255);paint(r0);rv.textContent='(claimed state)';});
function save(name,text,type){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:type}));a.download=name;document.body.appendChild(a);a.click();a.remove();}
$('dl').addEventListener('click',function(){save('relik-'+E.serial+'.svg',cur.svg,'image/svg+xml');});
var claim=JSON.stringify(D,null,2);$('json').textContent=claim;
$('cp').addEventListener('click',function(){try{navigator.clipboard.writeText(claim).then(function(){note.textContent='Claim copied.';},function(){note.textContent='Copy blocked: open Claim JSON and select the text.';});}catch(e){note.textContent='Copy blocked: open Claim JSON and select the text.';}});
$('chain').textContent=['network   '+D.network,'outpoint  '+(E.txId?E.txId+':'+E.index:'n/a'),'edition covenant id  '+(E.cov||'n/a'),'lane covenant id     '+(D.lane.covenantId||'n/a'),'genesis tx           '+(D.lane.genesisTxId||'n/a'),'script public key (claimed)  '+(E.spk||'n/a')].join('\\n');
})();`;

function buildRelik(o) {
  const prog = new Uint8Array(o.prog), series = o.series, e = o.edition, lane = o.lane || {};
  if (hx(b2(prog)) !== series.programHash) throw new Error('program does not hash to series.programHash');
  if (!/^\d{1,19}$/.test(String(e.serial))) throw new Error('bad serial');
  if (!/^[0-9a-f]{64}$/.test(e.lineage)) throw new Error('bad lineage');
  if (!Number.isInteger(e.sales) || e.sales < 0) throw new Error('bad sales');
  const hi = R.hostInputs(b2, String(e.serial), new Uint8Array(Buffer.from(e.lineage, 'hex')), e.sales);
  const svg = R.render(prog, hi.lanes, hi.serial32, hi.pat, hi.wear);
  const renderHash = hx(b2(new Uint8Array(Buffer.from(svg, 'ascii'))));
  const DATA = {
    kind: 'reliks-relik', v: 1, network: o.network || 'testnet-10', asOf: o.asOf || '', prog: hx(prog), renderHash,
    series: { programHash: series.programHash, artist: series.artist || '', royaltyBips: Number(series.royaltyBips || 0), engineLang: Number(series.engineLang || 0) },
    lane: { covenantId: lane.covenantId || '', genesisTxId: lane.genesisTxId || '' },
    edition: { serial: String(e.serial), lineage: e.lineage, sales: e.sales, owner: e.owner || '', price: Number(e.price || 0), cov: e.cov || '', txId: e.txId || '', index: e.index === undefined ? null : e.index, spk: e.spk || '' }
  };
  const body = '<main><h1>Relik #' + DATA.edition.serial + '</h1><p id="st" class="small">Checking\u2026</p><img id="art" alt="Relik artwork" hidden><dl id="meta"></dl>' +
    '<div class="row"><label class="small" for="rng">Wear preview <span id="rv"></span></label><input id="rng" type="range" min="0" max="255" value="0"><button class="btn ghost" id="reset">Reset</button></div>' +
    '<div class="row"><button class="btn" id="dl">Download SVG</button><button class="btn ghost" id="cp">Copy claim JSON</button></div><p id="note" class="small"></p>' +
    '<details><summary>Chain check (not done by this file)</summary><p class="small">To confirm this is the live state: find the outpoint below in a Kaspa explorer for the network, check it is unspent, and compare its script public key and covenant id with the values here. A transfer or sale after the date above changes the state and the art.</p><pre id="chain"></pre></details>' +
    '<details><summary>Claim JSON</summary><pre id="json"></pre></details>' +
    '<p class="small">Reliks-VM spec rev 2 (draft). Program hash = BLAKE2b-256 of the program bytes. Reference implementations: v13/vm (JS, Python, C) in the Reliks repository. This file contains everything needed to redraw the art offline.</p></main>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relik #' + DATA.edition.serial + '</title><style>' + CSS + '</style></head><body>' + body +
    '<script>window.RELIK=' + safe(JSON.stringify(DATA)) + ';</script>' +
    '<script>' + safe(read('web', 'blake2b.js')) + '</script>' +
    '<script>var RVM=(function(){var module={exports:{}};' + safe(read('v13', 'vm', 'rvm.js')) + '\nreturn module.exports;})();</script>' +
    '<script>' + safe(CLIENT) + '</script></body></html>';
}
module.exports = { buildRelik, findProgram };

if (require.main === module) {
  const [,, ledgerArg, abiArg, idxArg, outArg] = process.argv;
  if (!ledgerArg || !abiArg || idxArg === undefined) die('usage: node tools/make-relik.js <ledger.json> <factory-abi.json> <editionIndex> [outdir]');
  const LD = JSON.parse(fs.readFileSync(ledgerArg, 'utf8'));
  const abi = JSON.parse(fs.readFileSync(abiArg, 'utf8'));
  const bc = Buffer.from(abi.contracts[Object.keys(abi.contracts)[0]].compiled.bytecode);
  const prog = findProgram(bc, LD.series.program_hash);
  if (!prog) die('program with hash ' + LD.series.program_hash.slice(0, 16) + '... not found in the factory bytecode (wrong ABI for this ledger?)');
  const e = LD.editions[Number(idxArg)];
  if (!e) die('no edition ' + idxArg + ' (ledger has ' + LD.editions.length + ')');
  let html;
  try {
    html = buildRelik({
      prog, series: { programHash: LD.series.program_hash, artist: LD.series.artist, royaltyBips: LD.series.royalty_bips, engineLang: LD.series.engine_lang },
      edition: { serial: String(e.serial), lineage: e.lineage, sales: Number(e.sales), owner: e.owner, price: Number(e.price), cov: e.cov, txId: e.txId, index: e.index, spk: e.spk },
      lane: { covenantId: LD.C, genesisTxId: LD.genesisTxId }, network: process.env.RELIKS_NETWORK || 'testnet-10', asOf: fs.statSync(ledgerArg).mtime.toISOString()
    });
  } catch (err) { die(err.message); }
  const out = path.resolve(outArg || path.join(os.homedir(), 'reliks-files'));
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, 'relik-' + LD.series.program_hash.slice(0, 8) + '-' + e.serial + '.html');
  fs.writeFileSync(file, html);
  console.log(file + ' (' + html.length + ' bytes) | program ' + prog.length + ' B | sales ' + e.sales);
}
