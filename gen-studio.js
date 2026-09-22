const fs = require('fs');
const path = require('path');
const blakeSrc = fs.readFileSync(path.join(__dirname, 'web', 'gallery-blake2b.js'), 'utf8');
const walletSrc = fs.readFileSync(path.join(__dirname, 'web', 'studio-wallet.js'), 'utf8');
const runtime = fs.readFileSync(path.join(__dirname, 'web', 'reliks-studio-runtime.js'), 'utf8');
const CAP = Number(process.env.RELIKS_ENGINE_CAP || 32768);
const PRELUDE = [
"var R=(function(L,serial){",
"var x=(L[0]^serial)|0,y=L[1]|0,z=L[2]|0,w=L[3]|0;",
"function rnd(){var t=(x^(x<<11))|0;x=y;y=z;z=w;w=(w^(w>>>19))^(t^(t>>>8));return w>>>0;}",
"function ri(a,b){return a+(rnd()%(b-a+1));}",
"function pick(a){return a[rnd()%a.length];}",
"function chance(p){return rnd()%100<p;}",
"function hsl(){return 'hsl('+rnd()%360+','+ri(40,90)+'%,'+ri(30,70)+'%)';}",
"function sin(a){a&=4095;var s=a<2048?1:-1,q=a<2048?a:a-2048,u=q*(2048-q);return s*(16*u*10000/(20971520-4*u)|0);}",
"function cos(a){return sin(a+1024);}",
"function dir(a,len){return [cos(a)*len/10000|0,sin(a)*len/10000|0];}",
"function svg(parts,bg){return '<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1000 1000\">'+(bg?'<rect width=\"1000\" height=\"1000\" fill=\"'+bg+'\"/>':'')+parts.join('')+'</svg>';}",
"return {rnd:rnd,ri:ri,pick:pick,chance:chance,hsl:hsl,sin:sin,cos:cos,dir:dir,svg:svg,serial:serial,lanes:L};",
"})(L,serial);"
].join('\n');
const TEMPLATES = {
circles: [
"function reliks(L, serial) {",
"  var n = R.ri(18, 48), out = [];",
"  for (var i = 0; i < n; i++) {",
"    out.push('<circle cx=\"' + R.ri(0,1000) + '\" cy=\"' + R.ri(0,1000) +",
"      '\" r=\"' + R.ri(20,240) + '\" fill=\"' + R.hsl() +",
"      '\" fill-opacity=\"0.' + R.ri(30,85) + '\"/>');",
"  }",
"  return R.svg(out, '#000');",
"}"
].join('\n'),
flow: [
"function reliks(L, serial) {",
"  var out = [], i;",
"  for (i = 0; i < 700; i++) {",
"    var x = R.ri(0, 1000), y = R.ri(0, 1000);",
"    var a = (R.sin(x >> 2) + R.cos(y >> 2)) | 0;",
"    var d = R.dir(a, R.ri(20, 90));",
"    out.push('<line x1=\"' + x + '\" y1=\"' + y + '\" x2=\"' + (x + d[0]) +",
"      '\" y2=\"' + (y + d[1]) + '\" stroke=\"' + R.hsl() +",
"      '\" stroke-width=\"1\" opacity=\"0.5\"/>');",
"  }",
"  return R.svg(out, '#0a0b10');",
"}"
].join('\n'),
blank: [
"function reliks(L, serial) {",
"  return R.svg([], '#000');",
"}"
].join('\n')
};
const css = 'body{background:#0b0d10;color:#e8e6e3;font-family:ui-monospace,Menlo,Consolas,monospace;margin:0;padding:20px}' +
'h1{font-size:18px;letter-spacing:2px;margin:0 0 12px}h1 span{color:#7fd1ae}' +
'.row{margin:8px 0;font-size:12px}.row input,.row select,.row button{background:#101418;color:#e8e6e3;border:1px solid #23282e;border-radius:6px;padding:7px;font-family:inherit;font-size:12px;margin-right:6px}' +
'.wallet-connected{color:#7fd1ae;font-weight:700}.wallet-disconnected{color:#8a9199}' +
'.main{display:flex;gap:14px;margin-top:12px}textarea{flex:1;min-height:52vh;background:#101418;color:#d8e6dc;border:1px solid #23282e;border-radius:8px;padding:12px;font-family:inherit;font-size:12px;line-height:1.5;white-space:pre}' +
'.side{flex:1;display:flex;flex-direction:column;gap:10px}iframe{width:100%;aspect-ratio:1/1;border:1px solid #23282e;border-radius:8px;background:#000}' +
'pre{font-size:11px;color:#8a9199;white-space:pre-wrap;margin:0}#status{font-size:12px;color:#7fd1ae}' +
'.note{color:#5c6670;font-size:11px;margin-top:16px;border-top:1px solid #23282e;padding-top:12px;line-height:1.6}';

const wcScript = '<script type="module">\n' +
  'import SignClient from "https://esm.sh/@walletconnect/sign-client@2.13.0";\n' +
  'window.SignClient = SignClient;\n' +
  'window.dispatchEvent(new Event("signclient-loaded"));\n' +
  '</' + 'script>';
const qrScript = '<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></' + 'script>';

const html = ['<!doctype html>', '<html lang="en"><head>', '<meta charset="utf-8">',
'<meta name="viewport" content="width=device-width, initial-scale=1">',
'<title>Reliks Studio</title>', 
wcScript, qrScript,
'<style>' + css + '</style></head><body>',
'<h1>RELIKS <span>// studio</span></h1>',
'<div class="row">name <input id="name" value="my-engine" size="14"> template <select id="tpl"><option>circles</option><option>flow</option><option>blank</option></select> <button id="load">load template</button></div>',
'<div class="row"><button id="wallet-btn">Connect Kaspire</button> <span id="wallet-status"></span></div>',
'<div class="row">serial <input id="ser" value="1" size="20"> <button id="go">render</button> <button id="rnd">random</button> <button id="gates">run gates</button> <button id="exe">export engine .js</button> <button id="exs">export series .json</button></div>',
'<div class="main"><textarea id="ed" spellcheck="false"></textarea><div class="side"><iframe id="prev" sandbox=""></iframe><pre id="gates"></pre><pre id="hashes"></pre><div id="status"></div></div></div>',
'<div class="note">Engine = PRELUDE_V1 (' + PRELUDE.length + ' B, integer-only R API) + your code; anchored bytes include the prelude. Use only R.* for randomness (never Math.random/Date/network). <b>Connect Kaspire via WalletConnect</b> to auto-fill artist pubkey in series JSON. Workflow: edit &rarr; render &rarr; gates green &rarr; export engine .js + series .json &rarr; in Termux: <b>node reliks-lens.js &lt;name&gt;.js</b>, then RELIKS_ENGINE=./&lt;name&gt;.js RELIKS_ARGS=data/factory-args-&lt;name&gt;.json node gen-factory-args-v11.js series-&lt;name&gt;.json, then silverc + deploy-v11.js with RELIKS_FACTORY_ABI. Fill treasury pubkey manually. royalty_bips 1..2000, price 0 or &ge;100000000.</div>',
'<script>' + blakeSrc + '</' + 'script>',
'<script>' + walletSrc + '</' + 'script>',
'<script>',
'var PRELUDE=' + JSON.stringify(PRELUDE) + ';',
'var TEMPLATES=' + JSON.stringify(TEMPLATES) + ';',
'var CAP=' + CAP + ';',
runtime,
'</' + 'script>', '</body></html>'].join('\n');
fs.writeFileSync('reliks-studio.html', html);
console.log('reliks-studio.html written (' + html.length + ' bytes) | prelude ' + PRELUDE.length + ' B | cap ' + CAP + ' | Kaspire WalletConnect enabled');
