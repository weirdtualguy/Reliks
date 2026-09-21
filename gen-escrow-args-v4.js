const fs = require('fs');
const edArgs = JSON.parse(fs.readFileSync('data/edition-args-v4.json', 'utf8'));
const byteKind = edArgs[1].kind;                       // proven kind for `byte` from the edition args that compile
const ed = JSON.parse(fs.readFileSync('data/edition-abi-v6.json', 'utf8'));
const c = ed.contracts[Object.keys(ed.contracts)[0]];
const bc = Buffer.from(c.compiled.bytecode);
const off = c.compiled.state_span.offset, len = c.compiled.state_span.len;
const prefix = bc.subarray(0, off), suffix = bc.subarray(off + len);
const hash = Buffer.from(c.compiled.template_hash);
const Z = Buffer.alloc(32);
const BY = (b) => ({ kind: 'bytes', value: Array.from(b) });
const IN = (n) => ({ kind: 'int', value: n });
const args = [
  BY(Z),                        // init_owner          (state; dummy)
  { kind: byteKind, value: edArgs[1].value },         // init_scheme (state; dummy 0)
  BY(Z),                        // init_edition_covid  (state; dummy)
  IN(0),                        // init_askPrice       (state; dummy)
  IN(0),                        // init_expireAge      (state; dummy)
  BY(Z),                        // init_artist         (state; dummy)
  IN(0),                        // init_royalty_bips   (state; dummy)
  BY(Z),                        // init_offerer        (state; dummy)
  BY(Z),                        // init_marketplace    (state; dummy)
  IN(prefix.length),            // edition_prefix_len  (LITERAL: real)
  IN(suffix.length),            // edition_suffix_len  (LITERAL: real)
  BY(hash)                      // expected_template_hash (LITERAL: real)
];
fs.writeFileSync('data/escrow-args-v4.json', JSON.stringify(args, null, 2));
console.log('escrow-args-v4.json written | edition template literals:', prefix.length, suffix.length, hash.toString('hex'));
