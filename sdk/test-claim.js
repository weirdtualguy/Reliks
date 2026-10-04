'use strict';
const CH = require('../web/reliks-chain.js'), C = require('./claim.js'), R = require('./read.js');
CH.init(require('../reliks-templates.js')({ editionAbi: 'edition-abi-v13.json' }));
let bad = 0;
const t = (n, ok, d) => { if (!ok) bad = 1; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' | ' + d)); };
const hexOf = (u) => Buffer.from(u).toString('hex'), H = (c) => c.repeat(64);
const thrown = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const program = Uint8Array.from([0x52, 0x56, 0x4d, 0x01, 0x40, 0, 0x40, 0, 0x00]), PH = R.programHash(program);
const base = { ownerIdentifier: H('1'), identifierType: 0, price: '0', artist: H('2'), royalty_bips: '500', program_hash: PH, factory_covid: H('3'), serial: '12345', lineage: H('4'), sales: '2' };
const stOf = (s) => Object.assign({}, base, s || {});
const claimOf = (o, s) => Object.assign({ reliks_claim: 1, network: 'testnet-10', covenantId: H('9'), state: stOf(s) }, o || {});
const spkOf = (s) => CH.p2shSpk(CH.editionRedeem(stOf(s)));
const LIVE = (s, op) => ({ outpoint: op || (H('a') + ':0'), live: true, script_hex: spkOf(s), created_daa: 10 });
const SPENT = (s, daa) => ({ outpoint: H('b') + ':1', live: false, script_hex: spkOf(s), revealed_hex: hexOf(CH.editionRedeem(stOf(s))), created_daa: daa || 1 });
const mkIo = (utxos, extra) => ({ covenant: async () => Object.assign({ utxos }, extra || {}) });
const run = (o) => C.verifyClaim(Object.assign({ chain: CH, tipAgeSec: 5 }, o));
const chk = (r, n) => r.checks.find((c) => c.name === n);
(async () => {
  let r = await run({ io: mkIo([LIVE()]), claim: claimOf() });
  t('current', r.status === 'current' && r.ok === true && r.outpoint === H('a') + ':0', JSON.stringify(r.status));
  t('current carries provenance unchecked', r.provenance === 'unchecked');
  r = await run({ io: mkIo([LIVE()]), claim: claimOf(), tipAgeSec: 111978 });
  t('stale index -> index_stale, observed current', r.status === 'index_stale' && r.observed === 'current' && r.ok === false, r.status + ' ' + r.observed);
  r = await run({ io: mkIo([LIVE()]), claim: claimOf(), tipAgeSec: undefined });
  t('tip age missing -> index_stale', r.status === 'index_stale', r.status);
  t('boundary 600 s current', (await run({ io: mkIo([LIVE()]), claim: claimOf(), tipAgeSec: 600 })).status === 'current');
  t('boundary 601 s index_stale', (await run({ io: mkIo([LIVE()]), claim: claimOf(), tipAgeSec: 601 })).status === 'index_stale');
  r = await run({ io: mkIo([SPENT()]), claim: claimOf() });
  t('only a spent match -> stale_state', r.status === 'stale_state' && r.spentOutputs === 1, r.status);
  r = await run({ io: mkIo([SPENT()]), claim: claimOf(), tipAgeSec: 99999 });
  t('stale_state is final, not gated by freshness', r.status === 'stale_state', r.status);
  t('no match, fresh -> absent', (await run({ io: mkIo([]), claim: claimOf() })).status === 'absent');
  r = await run({ io: mkIo([]), claim: claimOf(), tipAgeSec: 99999 });
  t('no match, stale -> index_stale observed absent', r.status === 'index_stale' && r.observed === 'absent', r.status);
  t('unrelated live script -> absent', (await run({ io: mkIo([{ outpoint: H('c') + ':0', live: true, script_hex: 'aa20' + '00'.repeat(32) + '87' }]), claim: claimOf() })).status === 'absent');
  t('kascov throws -> unreachable', (await run({ io: { covenant: async () => { throw new Error('kascov 502'); } }, claim: claimOf(), tipAgeSec: 99999 })).status === 'unreachable');
  t('claim with another owner -> absent', (await run({ io: mkIo([LIVE()]), claim: claimOf(null, { ownerIdentifier: H('5') }) })).status === 'absent');
  t('outpoint hint matches -> current', (await run({ io: mkIo([LIVE()]), claim: claimOf({ outpoint: H('a') + ':0' }) })).status === 'current');
  t('outpoint hint differs -> outpoint_mismatch', (await run({ io: mkIo([LIVE()]), claim: claimOf({ outpoint: H('c') + ':0' }) })).status === 'outpoint_mismatch');
  t('two live matches -> ambiguous', (await run({ io: mkIo([LIVE(), LIVE(null, H('d') + ':0')]), claim: claimOf() })).status === 'ambiguous');
  const noIo = { covenant: async () => { throw new Error('must not be called'); } };
  const invalid = [
    ['wrong version', claimOf({ reliks_claim: 2 })], ['bad covenantId', claimOf({ covenantId: 'zz' })], ['null claim', null],
    ['state missing', Object.assign(claimOf(), { state: undefined })], ['negative sales', claimOf(null, { sales: '-1' })],
    ['price 2^63', claimOf(null, { price: '9223372036854775808' })], ['identifierType 1', claimOf(null, { identifierType: 1 })],
    ['unsafe number', claimOf(null, { price: 2 ** 60 })], ['bad outpoint', claimOf({ outpoint: 'abc' })],
    ['uppercase hex', claimOf(null, { ownerIdentifier: 'A'.repeat(64) })], ['short lineage', claimOf(null, { lineage: H('4').slice(2) })],
  ];
  for (const [n, c] of invalid) { const x = await run({ io: noIo, claim: c }); t('invalid claim: ' + n, x.status === 'invalid_claim', x.status); }
  t('network mismatch -> invalid_claim', (await run({ io: noIo, claim: claimOf(), network: 'mainnet' })).status === 'invalid_claim');
  r = await run({ io: mkIo([LIVE()]), claim: claimOf(), program });
  t('program matches -> current, program checks present', r.status === 'current' && !!chk(r, 'program_hash') && !!chk(r, 'program_render'), r.status);
  const other = Uint8Array.from([0x52, 0x56, 0x4d, 0x01, 0x41, 0, 0x40, 0, 0x00]);
  t('different program -> program_mismatch', (await run({ io: mkIo([LIVE()]), claim: claimOf(), program: other })).status === 'program_mismatch');
  const ser = { program_hash: PH, artist: H('2'), royalty_bips: 500 };
  t('series matches -> current', (await run({ io: mkIo([LIVE()]), claim: claimOf(), series: ser })).status === 'current');
  t('series artist differs -> series_mismatch', (await run({ io: mkIo([LIVE()]), claim: claimOf(), series: Object.assign({}, ser, { artist: H('8') }) })).status === 'series_mismatch');
  t('series without royalty -> series_mismatch', (await run({ io: mkIo([LIVE()]), claim: claimOf(), series: { program_hash: PH, artist: H('2') } })).status === 'series_mismatch');
  r = await run({ io: mkIo([SPENT({ sales: '1', ownerIdentifier: H('6'), lineage: H('7') }, 1), SPENT({ sales: '0', ownerIdentifier: H('8'), lineage: H('5') }, 0), LIVE()]), claim: claimOf() });
  t('consistent history -> current', r.status === 'current' && chk(r, 'history').detail.indexOf('2 spent') === 0, r.status + ' ' + JSON.stringify(chk(r, 'history')));
  t('history with another serial -> history_conflict', (await run({ io: mkIo([SPENT({ serial: '999' }), LIVE()]), claim: claimOf() })).status === 'history_conflict');
  t('history with another artist -> history_conflict', (await run({ io: mkIo([SPENT({ artist: H('8') }), LIVE()]), claim: claimOf() })).status === 'history_conflict');
  t('history sales above the claim -> history_conflict', (await run({ io: mkIo([SPENT({ sales: '3' }), LIVE()]), claim: claimOf() })).status === 'history_conflict');
  t('undecodable spent output -> history_conflict', (await run({ io: mkIo([{ outpoint: H('b') + ':1', live: false, script_hex: 'aa20' + '00'.repeat(32) + '87', revealed_hex: '00' }, LIVE()]), claim: claimOf() })).status === 'history_conflict');
  r = await run({ io: mkIo([LIVE()], { utxos_truncated: true }), claim: claimOf() });
  t('truncated history is noted, not failed', r.status === 'current' && chk(r, 'history').detail.indexOf('truncated') > 0, JSON.stringify(chk(r, 'history')));
  const ledger = { C: H('3'), series: { artist: H('2'), royalty_bips: 500, program_hash: PH }, editions: [{ cov: H('9'), owner: H('1'), price: 0, serial: '12345', lineage: H('4'), sales: 2, txId: H('a'), index: 0 }] };
  const lc = C.claimFromLedger(ledger, 0);
  t('claimFromLedger shape', lc.reliks_claim === 1 && lc.outpoint === H('a') + ':0' && lc.state.factory_covid === H('3') && C.validateClaim(lc) === null, JSON.stringify(C.validateClaim(lc)));
  t('claimFromLedger verifies current', (await run({ io: mkIo([LIVE()]), claim: lc, series: ledger.series })).status === 'current');
  t('claimFromLedger bad index throws', !!(await thrown(async () => C.claimFromLedger(ledger, 5))));
  t('missing io throws', !!(await thrown(() => C.verifyClaim({ chain: CH, claim: claimOf() }))));
  const cl = claimOf(), snap = JSON.stringify(cl); await run({ io: mkIo([LIVE()]), claim: cl });
  t('claim never mutated', JSON.stringify(cl) === snap);
  console.log(bad ? 'CLAIM TESTS FAILED' : 'CLAIM TESTS OK'); process.exit(bad);
})();
