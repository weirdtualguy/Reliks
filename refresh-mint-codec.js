const fs = require('fs');
const F = require('./data/factory-abi-v12.json');
const E = require('./data/edition-abi-v12.json');
const tpl = (abi, name) => { const c = abi.contracts[name]; const bc = c.compiled.bytecode; const s = c.compiled.state_span;
  return { prefixHex: Buffer.from(bc.slice(0, s.offset)).toString('hex'),
           suffixHex: Buffer.from(bc.slice(s.offset + s.len)).toString('hex'),
           span: s, templateHashHex: Buffer.from(c.compiled.template_hash).toString('hex') }; };
const TPL = JSON.stringify({ factory: tpl(F, 'SeriesFactory'), edition: tpl(E, 'ReliksEdition') });
const codec = fs.readFileSync('web/mint-codec.js', 'utf8');
if (/`|\$\{/.test(codec)) { console.error('FATAL: codec contains backticks/${} — unsafe inside gen-site template literal'); process.exit(1); }
let g = fs.readFileSync('gen-site.js', 'utf8');
const start = g.indexOf('<script>window.RELIKS_TPL=');
if (start === -1) { console.error('FATAL: RELIKS_TPL injection anchor not found'); process.exit(1); }
const headEnd = g.indexOf('</head>', start);
if (headEnd === -1) { console.error('FATAL: </head> after anchor not found'); process.exit(1); }
const block = '<script>window.RELIKS_TPL=' + TPL + ';</script>\n  <script>\n' + codec + '\n  </script>\n';
g = g.slice(0, start) + block + g.slice(headEnd);
fs.writeFileSync('gen-site.js', g);
console.log('✅ codec block refreshed (anchor → </head> splice, no duplicates)');
