const fs = require('fs');
const src = fs.readFileSync(process.env.HOME + '/opt/silverscript/contracts/SeriesFactory.sil', 'utf8');
const lines = src.split('\n');
const i = lines.findIndex(l => l.includes('entry mint('));
if (i < 0) { console.error('anchor "entry mint(" not found'); process.exit(1); }
lines.splice(i + 1, 0,
  '        require(royalty_bips <= 10000);',
  '        require(OpCovInputCount(OpInputCovenantId(this.activeInputIndex)) == 1);');
fs.writeFileSync(process.env.HOME + '/opt/silverscript/contracts/SeriesFactory-v2.sil', lines.join('\n'));
console.log('✅ SeriesFactory-v2.sil written (v1 untouched)');
