'use strict';
// Series-specific template object for web/reliks-chain.js init(): same derivation as reliks-templates.js, but the factory ABI is a parameter.
const fs = require('fs'), path = require('path');
function fromAbi(file) {
  const abi = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const name = Object.keys(abi.contracts)[0], c = abi.contracts[name].compiled;
  const bc = Buffer.from(c.bytecode), span = c.state_span;
  const th = Array.isArray(c.template_hash) ? Buffer.from(c.template_hash) : Buffer.from(c.template_hash, 'hex');
  const entries = {};
  for (const [k, v] of Object.entries(abi.contracts[name].entries || {})) entries[k] = v.dispatch_tag;
  const fields = abi.contracts[name].runtime_state.fields.map((f) => f.name);
  return { prefixHex: bc.subarray(0, span.offset).toString('hex'), suffixHex: bc.subarray(span.offset + span.len).toString('hex'), span: { offset: span.offset, len: span.len }, templateHashHex: th.toString('hex'), entries, fields };
}
function templatesFor(o) { return { factory: fromAbi(o.factoryAbi), edition: fromAbi(o.editionAbi) }; }
module.exports = { templatesFor, fromAbi };
