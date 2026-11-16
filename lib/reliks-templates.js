// Derives the browser template blob (prefix / suffix / state span) from the
// compiled canonical ABIs in contracts/. The canonical factory, edition, and
// escrow hashes are pinned in TEMPLATE-HASHES.json and enforced by
// tools/verify-contract.js.
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
  const fields = abi.contracts[name].runtime_state.fields.map((f) => f.name);
  return {
    name, entries, fields,
    prefixHex: bc.subarray(0, span.offset).toString('hex'),
    suffixHex: bc.subarray(span.offset + span.len).toString('hex'),
    span: { offset: span.offset, len: span.len },
    templateHashHex: th.toString('hex')
  };
}
const fromContracts = (file) => fromAbiFile(path.resolve(__dirname, '..', 'contracts', file));
const tpl = (t) => ({ prefixHex: t.prefixHex, suffixHex: t.suffixHex, span: t.span, templateHashHex: t.templateHashHex, entries: t.entries, fields: t.fields });

module.exports = function templates() {
  return {
    factory: tpl(fromContracts('factory.json')),
    edition: tpl(fromContracts('edition.json')),
    escrow: tpl(fromContracts('escrow.json'))
  };
};
