// Derives the browser template blob (prefix / suffix / state span) from the
// canonical compiled ABIs in data/. The site no longer embeds a hand-pasted
// copy: what ships is always recomputed from the frozen v12 artifacts.
'use strict';
const fs = require('fs');
const path = require('path');

function fromAbi(file) {
  const abi = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', file), 'utf8'));
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

module.exports = function templates() {
  const f = fromAbi('factory-abi-v12.json');
  const e = fromAbi('edition-abi-v12.json');
  return {
    factory: { prefixHex: f.prefixHex, suffixHex: f.suffixHex, span: f.span, templateHashHex: f.templateHashHex, entries: f.entries, fields: f.fields },
    edition: { prefixHex: e.prefixHex, suffixHex: e.suffixHex, span: e.span, templateHashHex: e.templateHashHex, entries: e.entries, fields: e.fields }
  };
};
