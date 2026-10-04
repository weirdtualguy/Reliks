'use strict';
// Read-only, no key. Usage: PC_NET=testnet node sdk/lane-live.js <ledger.json> <factory-abi.json> [<edition-abi.json>]
const fs = require('fs');
const N = require('../network.js'), CH = require('../web/reliks-chain.js'), R = require('./read.js'), T = require('./templates.js'), L = require('./lane.js');
const [lp, fa, ea] = process.argv.slice(2);
if (!lp || !fa) { console.log('usage: node sdk/lane-live.js <ledger.json> <factory-abi.json> [<edition-abi.json>]'); process.exit(2); }
CH.init(T.templatesFor({ factoryAbi: fa, editionAbi: ea || 'data/edition-abi-v13.json' }));
const led = JSON.parse(fs.readFileSync(lp, 'utf8'));
(async () => {
  const io = CH.makeIO({ rest: N.rest, kascov: N.kascov }), age = await R.kascovTipAgeSec(N.kascov);
  const r = await L.resolveLaneKascov({ chain: CH, io, laneCovenantId: led.C, series: led.series, tipAgeSec: age });
  console.log(N.label + ' | staleness ' + (age === undefined ? 'unknown' : age + ' s') + ' | lane ' + led.C.slice(0, 8) + ' | ' + r.status);
  r.checks.filter((c) => !c.ok).forEach((c) => console.log('   failed: ' + c.name + (c.detail ? ' (' + c.detail + ')' : '')));
  if (r.ok) {
    const want = BigInt(led.series.mints_left) - BigInt(led.editions.length);
    console.log('   mints_left ' + r.state.mints_left + ' | ledger says ' + want + ' | match ' + (r.state.mints_left === want) + ' | price ' + r.state.price + ' | engine_lang ' + r.state.engine_lang + ' | lane value ' + r.value + ' | live at ' + r.outpoint.txId.slice(0, 14) + ':' + r.outpoint.index + ' | ' + r.source);
  }
  process.exit(r.ok ? 0 : 1);
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
