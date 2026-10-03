// Read-only kascov freshness check. Exit 2 if the index looks stale or unreachable.
const N = require('../network.js');
(async () => {
  const j = await (await fetch(N.kascov + '-live.json')).json();
  const age = Math.round((Date.now() - j.tip_at_ms) / 1000);
  const lag = Number(j.tip_daa) - Number(j.processed_daa);
  let ps = '?'; try { ps = (await (await fetch(N.kascov + '/pending')).json()).status; } catch (e) {}
  console.log('kascov ' + N.label + ': tip age ' + age + ' s | sync lag ' + lag + ' DAA (about ' + Math.round(lag / 10) + ' s) | pending feed ' + ps);
  const stale = age > 600 || lag > 6000 || ps === 'stale';
  console.log(stale ? 'STALE: kascov-based checks (verify-vm-render, fetch-history, demo refresh, mint lane lookup) are unreliable right now' : 'fresh');
  process.exit(stale ? 2 : 0);
})().catch(e => { console.error('kascov unreachable:', e.message); process.exit(2); });
