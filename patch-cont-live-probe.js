const fs = require('fs');
const p = 'web/reliks-gallery-runtime.js';
let s = fs.readFileSync(p, 'utf8');
const old = "var contSpkLive = await liveSpk(factorySpk(REG.initMints - i - 1), ed.txId, 0);";
const neu = "var contSpkLive = await liveSpk(factorySpk(REG.initMints - i - 1), ed.mintTxId || ed.txId, 0);";
if (!s.includes(old)) { console.error('continuation live-probe anchor not found'); process.exit(1); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log('continuation live probe now targets the lane at mintTx:0 (its true location)');
