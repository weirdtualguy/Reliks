const [,, addr, pub] = process.argv;
(async () => {
  const res = await fetch('https://api.kaspa.org/addresses/' + addr + '/utxos');
  const j = await res.json();
  console.log('HTTP', res.status);
  const list = Array.isArray(j) ? j : (j.utxos || j.data || []);
  if (!list.length) { console.log('raw response head:', JSON.stringify(j).slice(0, 400)); process.exit(1); }
  const e = list[0].utxoEntry || list[0];
  const raw = e.scriptPublicKey;
  const spk = (raw && raw.scriptPublicKey) || raw; // REST wraps as { version, scriptPublicKey }
  console.log('utxos:', list.length, '| amount:', e.amount, '| spk:', spk);
  console.log(spk === ('20' + pub + 'ac') ? '✅ MAPPING PROVEN: UTXO spendable by PC_PRIV' : '❌ MISMATCH — stop, investigate');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
