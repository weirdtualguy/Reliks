// Snapshots kascov covenant history for every VM-ledger edition into v13/history-vm-v13.json (read-only).
const fs = require('fs'), V = require('../reliks-lib.js');
const LD = JSON.parse(require('fs').readFileSync(process.env.RELIKS_LEDGER || 'v13/ledger-vm-v13.json','utf8'));
(async () => {
  const out = {};
  for (let i = 0; i < LD.editions.length; i++) {
    const e = LD.editions[i];
    const j = await (await fetch(V.kascov + '/c/' + e.cov + '.json')).json();
    if (j.events_truncated) console.log('WARNING: events truncated for edition ' + i);
    out[e.cov] = (j.events || []).map(x => ({ kind: x.kind, seq: x.seq, txid: x.txid, t: x.accepting_time_ms, daa: x.accepting_daa }));
    console.log('#' + i + ': ' + out[e.cov].length + ' events (sales ' + e.sales + ')');
  }
  fs.writeFileSync(process.env.RELIKS_HISTORY || 'v13/history-vm-v13.json', JSON.stringify(out, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
