const fs = require('fs');
const p = 'web/reliks-gallery-runtime.js';
let s = fs.readFileSync(p, 'utf8');
const oldEnc = "pushInt(s.engine_lang), pushBytes(s.render_hash)]);";
const newEnc = "pushInt(s.engine_lang), pushBytes(s.render_hash), pushBytes(s.treasury)]);";
if (!s.includes(oldEnc)) { console.error('encFactoryState anchor not found'); process.exit(1); }
s = s.split(oldEnc).join(newEnc);
const oldSt = "mints_left: mintsLeft, engine_lang: REG.series.engine_lang, render_hash: REG.series.render_hash };";
const newSt = "mints_left: mintsLeft, engine_lang: REG.series.engine_lang, render_hash: REG.series.render_hash, treasury: REG.series.treasury };";
if (!s.includes(oldSt)) { console.error('factorySpk state anchor not found'); process.exit(1); }
s = s.split(oldSt).join(newSt);
fs.writeFileSync(p, s);
console.log('runtime encFactoryState + factorySpk now encode the 8-field v11 state (treasury appended)');
