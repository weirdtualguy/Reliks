'use strict';
const fs = require('fs');
const sdk = require('./read.js');
const CH = require('../web/reliks-chain.js');
CH.init(require('../reliks-templates.js')({ editionAbi: 'edition-abi-v13.json' }));
const LP = 'v13/ledger-vm-v13.json';
if (!fs.existsSync(LP)) { console.log('SKIP no ledger'); process.exit(0); }
const LD = JSON.parse(fs.readFileSync(LP, 'utf8')), S = LD.series, ed = LD.editions[0];
const spk = sdk.normSpk(ed.spk).spk, op = ed.txId + ':' + ed.index;
const u = (o) => Object.assign({ outpoint: op, script_hex: '0000' + spk, live: true }, o);
const mk = (utxos) => ({ covenant: async () => ({ utxos }) });
const cases = [
  ['confirmed', mk([u()]), ed, 'confirmed'],
  ['spent', mk([u({ live: false })]), ed, 'spent'],
  ['absent', mk([]), ed, 'absent'],
  ['other outpoint', mk([u({ outpoint: '00'.repeat(32) + ':0' })]), ed, 'live_other_outpoint'],
  ['unreachable', { covenant: async () => { throw new Error('kascov 502'); } }, ed, 'unreachable'],
  ['ledger mismatch', mk([u()]), Object.assign({}, ed, { sales: ed.sales + 1 }), 'ledger_mismatch'],
];
(async () => {
  let bad = 0;
  for (const [name, io, e, want] of cases) {
    const r = await sdk.verifyEditionOnChain({ chain: CH, io, series: S, covId: LD.C, edition: e });
    const ok = r.status === want; if (!ok) bad = 1;
    console.log((ok ? 'PASS ' : 'FAIL ') + name + ' -> ' + r.status);
  }
  console.log(bad ? 'ONCHAIN MOCK FAILED' : 'ONCHAIN MOCK OK'); process.exit(bad);
})();
