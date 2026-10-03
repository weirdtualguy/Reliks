'use strict';
// Read-only, no key. Usage: PC_NET=testnet node sdk/verify-live.js [ledger.json]
const fs = require('fs');
const N = require('../network.js'), CH = require('../web/reliks-chain.js'), sdk = require('./read.js');
CH.init(require('../reliks-templates.js')({ editionAbi: 'edition-abi-v13.json' }));
const L = JSON.parse(fs.readFileSync(process.argv[2] || 'v13/ledger-vm-v13.json', 'utf8'));
(async () => {
  const io = CH.makeIO({ rest: N.rest, kascov: N.kascov });
  const age = await sdk.kascovTipAgeSec(N.kascov);
  console.log(N.label + ' | kascov staleness (tip age + sync lag): ' + (age === undefined ? 'unknown' : age + ' s'));
  let bad = 0;
  for (const [i, e] of L.editions.entries()) {
    const r = await sdk.verifyEditionOnChain({ chain: CH, io, series: L.series, covId: L.C, edition: e, tipAgeSec: age });
    if (r.status !== 'confirmed') bad = 1;
    console.log('edition ' + i + ' (sales ' + e.sales + '): ' + r.status + (r.observed ? ' (index showed: ' + r.observed + ')' : ''));
  }
  process.exit(bad);
})();
