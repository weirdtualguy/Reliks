const fs = require('fs');
const p = 'web/reliks-gallery-runtime.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('function p2shAddress')) { console.log('already patched'); process.exit(0); }

const helpers = `/* ---- bech32 (Kaspa addresses) for UTXO-set anchoring ---- */
  var B32C = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  function b32polymod(values) { var GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; var chk = 1; for (var i = 0; i < values.length; i++) { var top = chk >> 25; chk = ((chk & 0x1ffffff) << 5) ^ values[i]; for (var j = 0; j < 5; j++) { if ((top >> j) & 1) chk ^= GEN[j]; } } return chk; }
  function b32expand(hrp) { var out = []; var i; for (i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5); out.push(0); for (i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31); return out; }
  function b32convert(data) { var acc = 0, bits = 0, out = []; for (var i = 0; i < data.length; i++) { acc = (acc << 8) | data[i]; bits += 8; while (bits >= 5) { bits -= 5; out.push((acc >> bits) & 31); } } if (bits > 0) out.push((acc << (5 - bits)) & 31); return out; }
  function bech32Encode(hrp, bytes) { var data = b32convert(bytes); var mod = b32polymod(b32expand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0])) ^ 1; var all = data.slice(); for (var i = 0; i < 6; i++) all.push((mod >> (5 * (5 - i))) & 31); var s2 = ''; for (i = 0; i < all.length; i++) s2 += B32C[all[i]]; return hrp + ':' + s2; }
  function p2pkAddress(spkHex) { var b = hexToBytes(spkHex); return bech32Encode(REG.hrp, [0].concat(Array.prototype.slice.call(b.subarray(1, 33)))); }
  function p2shAddress(spkHex) { var b = hexToBytes(spkHex); return bech32Encode(REG.hrp, [8].concat(Array.prototype.slice.call(b.subarray(2, 34)))); }
  var _utxoCache = {};
  async function liveSpk(spkHex, txId, index) {
    var addr;
    try { addr = p2shAddress(spkHex); } catch (e) { return null; }
    try {
      if (!_utxoCache[addr]) {
        var r = await fetch(REG.rest + '/addresses/' + addr + '/utxos');
        if (!r.ok) return null;
        _utxoCache[addr] = await r.json();
      }
    } catch (e) { return null; }
    var list = _utxoCache[addr] || [];
    for (var i = 0; i < list.length; i++) if (list[i].outpoint.transactionId === txId && list[i].outpoint.index === index) {
      var sp = list[i].utxoEntry.scriptPublicKey;
      return typeof sp === 'string' ? sp : (sp.scriptPublicKey || sp.script_public_key || '');
    }
    return null;
  }
  `;
const anchorFn = 'function fetchTx(id) {';
if (!s.includes(anchorFn)) { console.error('fn anchor not found'); process.exit(1); }
s = s.split(anchorFn).join(helpers + anchorFn);

const oldEd = "checks.push(['edition spk == mintTx.outputs[' + ed.index + ']', editionSpk(ed) === spkOf(mintTx.outputs[ed.index])]);";
const newEd = "var edSpkLive = await liveSpk(editionSpk(ed), ed.txId, ed.index);\n        checks.push([edSpkLive === null ? 'edition spk == mintTx.outputs[' + ed.index + '] (not in live UTXO set; archival source)' : 'edition spk == LIVE UTXO set (never pruned)', edSpkLive === null ? editionSpk(ed) === spkOf(mintTx.outputs[ed.index]) : edSpkLive === editionSpk(ed)]);";
if (!s.includes(oldEd)) { console.error('edition check anchor not found'); process.exit(1); }
s = s.split(oldEd).join(newEd);

const oldCont = "checks.push(['continuation spk (mints_left=' + (REG.initMints - i - 1) + ') == mintTx.outputs[0]', factorySpk(REG.initMints - i - 1) === spkOf(mintTx.outputs[0])]);";
const newCont = "var contSpkLive = await liveSpk(factorySpk(REG.initMints - i - 1), ed.txId, 0);\n        checks.push([contSpkLive === null ? 'continuation spk (mints_left=' + (REG.initMints - i - 1) + ') == mintTx.outputs[0] (spent; archival source)' : 'continuation spk (mints_left=' + (REG.initMints - i - 1) + ') == LIVE UTXO set (never pruned)', contSpkLive === null ? factorySpk(REG.initMints - i - 1) === spkOf(mintTx.outputs[0]) : contSpkLive === factorySpk(REG.initMints - i - 1)]);";
if (!s.includes(oldCont)) { console.error('continuation check anchor not found'); process.exit(1); }
s = s.split(oldCont).join(newCont);

const oldGen = "globalChecks.push(['genesis lane spk == deployTx.outputs[0]', factorySpk(REG.initMints) === spkOf(deployTx.outputs[0])]);";
const newGen = "globalChecks.push(['genesis lane spk == deployTx.outputs[0] (spent; archival source)', factorySpk(REG.initMints) === spkOf(deployTx.outputs[0])]);";
if (!s.includes(oldGen)) { console.error('genesis check anchor not found'); process.exit(1); }
s = s.split(oldGen).join(newGen);

const oldExp = 'p2shHex: p2shHex, blakeHex: blakeHex,';
const newExp = 'p2shHex: p2shHex, p2pkAddress: p2pkAddress, p2shAddress: p2shAddress, liveSpk: liveSpk, blakeHex: blakeHex,';
if (!s.includes(oldExp)) { console.error('exports anchor not found'); process.exit(1); }
s = s.split(oldExp).join(newExp);
fs.writeFileSync(p, s);
console.log('patched runtime: bech32 addresses + UTXO-set anchoring for live outputs');
