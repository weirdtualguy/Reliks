const fs = require('fs');
let s = fs.readFileSync('marketplace.js', 'utf8');

const fetchRetry = [
  'async function fetchRetry(url, opts, retries) {',
  '  retries = retries || 4;',
  '  for (let i = 0; i < retries; i++) {',
  '    try { return await fetch(url, opts); }',
  '    catch (e) {',
  '      if (i === retries - 1) throw e;',
  "      console.log('  network drop, retry ' + (i + 1) + '...');",
  '      await new Promise(r => setTimeout(r, 2500));',
  '    }',
  '  }',
  '}',
  ''
].join('\n');

if (s.indexOf('fetchRetry') === -1) {
  s = s.split('const PRIV =').join(fetchRetry + 'const PRIV =');
  s = s.split('await fetch(`https://api-tn10').join('await fetchRetry(`https://api-tn10');
}

const oldBlock = [
  '  const cov = await (await fetch(`https://kascov.io/data/testnet-10/c/${covid}.json`)).json();',
  '  const utxo = cov.utxos.find(u => u.live);',
  "  if (!utxo) { console.error('No live UTXO'); process.exit(1); }",
  "  const [txId, idxStr] = utxo.outpoint.split(':');",
  '  const index = parseInt(idxStr, 10);',
  '  const amount = BigInt(utxo.value);',
  '  const oldRedeem = B.concat([prefix, encodeState(ed), suffix]);',
  '  const oldSpk = p2sh(oldRedeem);',
  "  if (oldSpk !== utxo.script_hex) { console.error('❌ P2SH drift: computed', oldSpk, 'onchain', utxo.script_hex); process.exit(1); }"
].join('\n');

const newBlock = [
  '  const oldRedeem = B.concat([prefix, encodeState(ed), suffix]);',
  '  const oldSpk = p2sh(oldRedeem);',
  '  let cov, utxo;',
  '  for (let attempt = 1; attempt <= 24; attempt++) {',
  "    cov = await (await fetchRetry('https://kascov.io/data/testnet-10/c/' + covid + '.json')).json();",
  '    utxo = cov.utxos.find(u => u.live && u.script_hex === oldSpk);',
  '    if (utxo) break;',
  '    const live = cov.utxos.find(u => u.live);',
  "    console.log('  indexer lag: live spk ' + (live ? live.script_hex : 'none') + ' != expected ' + oldSpk + ' (' + attempt + '/24)');",
  '    await new Promise(r => setTimeout(r, 5000));',
  '  }',
  "  if (!utxo) { console.error('❌ P2SH drift persists after polling: expected', oldSpk); process.exit(1); }",
  "  const [txId, idxStr] = utxo.outpoint.split(':');",
  '  const index = parseInt(idxStr, 10);',
  '  const amount = BigInt(utxo.value);'
].join('\n');

if (s.indexOf(oldBlock) === -1) { console.error('anchor not found — marketplace.js changed?'); process.exit(1); }
s = s.split(oldBlock).join(newBlock);
fs.writeFileSync('marketplace.js', s);
console.log('✅ marketplace.js patched: spk-matched input resolution + fetchRetry');
