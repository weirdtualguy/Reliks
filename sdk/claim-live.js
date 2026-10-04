'use strict';
// Read-only, no key. Usage: PC_NET=testnet node sdk/claim-live.js <claim.json> | --ledger <ledger.json>
const fs = require('fs');
const N = require('../network.js'), CH = require('../web/reliks-chain.js'), R = require('./read.js'), C = require('./claim.js');
CH.init(require('../reliks-templates.js')({ editionAbi: 'edition-abi-v13.json' }));
(async () => {
  const a = process.argv.slice(2);
  let claims, series;
  if (a[0] === '--ledger') { const L = JSON.parse(fs.readFileSync(a[1], 'utf8')); series = L.series; claims = L.editions.map((e, i) => C.claimFromLedger(L, i, { network: N.label })); }
  else if (a[0]) { const j = JSON.parse(fs.readFileSync(a[0], 'utf8')); claims = Array.isArray(j) ? j : [j]; }
  else { console.log('usage: PC_NET=testnet node sdk/claim-live.js <claim.json> | --ledger <ledger.json>'); process.exit(2); }
  const io = CH.makeIO({ rest: N.rest, kascov: N.kascov }), age = await R.kascovTipAgeSec(N.kascov);
  console.log(N.label + ' | kascov staleness (tip age + sync lag): ' + (age === undefined ? 'unknown' : age + ' s'));
  let bad = 0;
  for (const [i, c] of claims.entries()) {
    const r = await C.verifyClaim({ chain: CH, io, claim: c, series, network: N.label, tipAgeSec: age });
    if (!r.ok) bad = 1;
    console.log('claim ' + i + ' (covenant ' + String(c.covenantId).slice(0, 8) + '): ' + r.status + (r.observed ? ' (index showed: ' + r.observed + ')' : '') + (r.outpoint ? ' | live at ' + String(r.outpoint).slice(0, 14) : '') + ' | provenance ' + r.provenance);
    r.checks.filter((x) => !x.ok).forEach((x) => console.log('   failed: ' + x.name + (x.detail ? ' (' + x.detail + ')' : '')));
  }
  process.exit(bad);
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
