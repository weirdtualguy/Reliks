'use strict';
const s = require('fs').readFileSync('cli/gen-factory-args.js', 'utf8');
let bad = 0;
const t = (n, ok) => { if (!ok) bad = 1; console.log((ok ? 'PASS ' : 'FAIL ') + n); };
t('no hardcoded int(1) after the program bytes', !/bytes\(progBuf\),\s*int\(1\)/.test(s));
t('engine_lang defaults to 2, overridable by ENGINE_LANG', /const engineLang = Number\(process\.env\.ENGINE_LANG \|\| 2\)/.test(s));
t('emits 12 constructor arguments including init_next_serial', /init_next_serial/.test(s));
console.log(bad ? 'VM-ARGS TEXT CHECK FAILED' : 'VM-ARGS TEXT CHECK OK'); process.exit(bad);
