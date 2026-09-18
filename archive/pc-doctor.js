const fs = require('fs');
const ok = (n, c, extra='') => console.log((c ? '✅' : '❌') + ' ' + n + (extra ? '  ' + extra : ''));
(async () => {
  ok('node >= 18', +process.versions.node.split('.')[0] >= 18, 'v' + process.versions.node);
  for (const m of ['@noble/hashes/blake2b', '@noble/secp256k1', 'ws']) {
    let good = true; try { require(m); } catch (e) { good = false; }
    ok('npm dep ' + m, good);
  }
  ok('silverc binary', fs.existsSync(process.env.HOME + '/opt/silverscript/target/release/silverc'));
  for (const f of ['web/index.html', 'bech32-solved.js', 'editions-ledger.json', 'factory-ledger-v3.json',
                   'factory-abi-v3.json', 'edition-abi-v3.json', 'factory-args-v3.json', 'drip.js', 'verify-v3.js',
                   'SESSION-SNAPSHOT.md', 'HANDOFF.md', 'secrets.env'])
    ok('file ' + f, fs.existsSync(f));
  try { const r = await fetch('http://127.0.0.1:8080/web/'); ok('http-server :8080', r.ok, 'status ' + r.status); }
  catch (e) { ok('http-server :8080', false, 'down — run: pc server start'); }
  try { const L = JSON.parse(fs.readFileSync('factory-ledger-v3.json', 'utf8'));
    const r = await fetch('https://kascov.io/data/testnet-10/c/' + L.covenantId + '.json');
    const j = await r.json(); ok('kascov indexer', r.ok, 'live utxos: ' + (j.utxos || []).filter(u => u.live).length); }
  catch (e) { ok('kascov indexer', false, e.message); }
  try { const r = await fetch('https://api-tn10.kaspa.org/addresses/kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd/utxos');
    ok('kaspad REST', r.ok); } catch (e) { ok('kaspad REST', false, e.message); }
  try { const m = await import('./bech32-solved.js');
    const v = m.encodePub('00'.repeat(32));
    ok('bech32 self-test', v === 'kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhqrxplya'); }
  catch (e) { ok('bech32 self-test', false, e.message); }
  console.log('— doctor done —');
})();
