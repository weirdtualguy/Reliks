// Derives the browser template blob (prefix / suffix / state span) from compiled
// ABIs. Two sets:
//   - Canonical (v13): from contracts/ — the only deployable set. Use
//     makeTemplates({ canonical: true }) or makeTemplates({ editionAbi:
//     'edition-abi-v13.json' }) (the old name now resolves to the canonical
//     edition). The canonical factory/edition/escrow hashes are pinned in
//     TEMPLATE-HASHES.json and enforced by tools/verify-contract.js.
//   - Legacy (v12): from data/ — for the one live mainnet series
//     (genesis-dag-city), whose factory (b070609c…) and edition (0514190a…)
//     are legacy hashes. The indexer flags that series "legacy, unsafe".
//     The v12 ABIs stay in data/ only because that live series needs them.
'use strict';
const fs = require('fs');
const path = require('path');

function fromAbiFile(absPath) {
  const abi = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  const name = Object.keys(abi.contracts)[0];
  const c = abi.contracts[name].compiled;
  const bc = Buffer.from(c.bytecode);
  const span = c.state_span;
  const th = Array.isArray(c.template_hash) ? Buffer.from(c.template_hash) : Buffer.from(c.template_hash, 'hex');
  const entries = {};
  for (const [k, v] of Object.entries(abi.contracts[name].entries || {})) entries[k] = v.dispatch_tag;
  const fields = abi.contracts[name].runtime_state.fields.map(f => f.name);
  return {
    name, entries, fields,
    prefixHex: bc.subarray(0, span.offset).toString('hex'),
    suffixHex: bc.subarray(span.offset + span.len).toString('hex'),
    span: { offset: span.offset, len: span.len },
    templateHashHex: th.toString('hex')
  };
}
const fromData = (file) => fromAbiFile(path.resolve(__dirname, '..', 'data', file));
const fromContracts = (file) => fromAbiFile(path.resolve(__dirname, '..', 'contracts', file));
const tpl = (t) => ({ prefixHex: t.prefixHex, suffixHex: t.suffixHex, span: t.span, templateHashHex: t.templateHashHex, entries: t.entries, fields: t.fields });

module.exports = function templates(opts) {
  opts = opts || {};
  // Canonical v13 set (from contracts/). The old 'edition-abi-v13.json' name
  // now resolves here — that file was the pre-fix edition and is archived in
  // archive/deprecated/data/.
  if (opts.canonical || opts.editionAbi === 'edition-abi-v13.json') {
    return {
      factory: tpl(fromContracts('factory.json')),
      edition: tpl(fromContracts('edition.json')),
      escrow: tpl(fromContracts('escrow.json')),
    };
  }
  // Legacy v12 set (from data/). Only for the live legacy series.
  const f = fromData('factory-abi-v12.json');
  const e = fromData(opts.editionAbi || 'edition-abi-v12.json');
  return {
    factory: tpl(f),
    edition: tpl(e),
  };
};
