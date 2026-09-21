const V = require('./v8-lib.js');
const fs = require('fs');
(async () => {
  const LD = JSON.parse(fs.readFileSync('data/factory-ledger-v8.json', 'utf8'));
  const Ed = V.parts(JSON.parse(fs.readFileSync('data/edition-abi-v4.json', 'utf8')));
  let bad = 0;
  for (const ed of LD.editions) {
    const tx = await (await V.fetchRetry(V.rest + '/transactions/' + ed.txId)).json();
    const outs = tx.outputs || (tx.transaction && tx.transaction.outputs);
    const live = (outs[ed.index].script_public_key || outs[ed.index].scriptPublicKey);
    const st = { ownerIdentifier: ed.owner, identifierType: 0, price: ed.price, artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial: ed.serial };
    const redeem = V.B.concat([Ed.prefix, V.encState(Ed, st), Ed.suffix]);
    const expect = V.hex(V.blake2b(redeem, { dkLen: 32 }));
    const got = (live.indexOf('aa20') >= 0 ? live.slice(live.indexOf('aa20') + 4, live.indexOf('aa20') + 68) : live.slice(4, 68)); // skip version byte + OP_BLAKE2B(0xaa) + push len (0x20)
    const ok = expect === got;
    if (!ok) bad++;
    console.log(ed.cov.slice(0, 16) + ' @' + ed.txId.slice(0, 8) + ':' + ed.index, ok ? '✅ on-chain P2SH == blake2b(ledger-state redeem)' : '❌ MISMATCH live=' + got + ' expect=' + expect);
  }
  console.log(bad === 0 ? '✅ ledger consistent with chain for ' + LD.editions.length + ' edition(s)' : '❌ ' + bad + ' mismatch(es)');
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
