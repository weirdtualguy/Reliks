'use strict';
// Source-text check only: the generator writes files when run, so it is never executed here.
const s = require('fs').readFileSync('v13/gen-vm-factory-args.js', 'utf8');
let bad = 0;
const t = (n, ok) => { if (!ok) bad = 1; console.log((ok ? 'PASS ' : 'FAIL ') + n); };
t('no hardcoded int(1) after the program bytes', !/bytes\(prog\),\s*int\(1\)/.test(s));
t('engine_lang defaults to 2, overridable by ENGINE_LANG', /bytes\(prog\),\s*int\(Number\(process\.env\.ENGINE_LANG \|\| 2\)\)/.test(s));
t('header comment says engine_lang = 2', /engine_lang = 2/.test(s.split('\n')[0]));
console.log(bad ? 'VM-ARGS TEXT CHECK FAILED' : 'VM-ARGS TEXT CHECK OK'); process.exit(bad);
