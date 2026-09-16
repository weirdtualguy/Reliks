const fs = require('fs');
let s = fs.readFileSync(process.argv[2], 'utf8')
  .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
const isWord = c => /[A-Za-z0-9_$]/.test(c);
let out = '';
for (let i = 0; i < s.length; i++) {
  const c = s[i];
  if (c === ' ') { const p = out[out.length - 1] || '', n = s[i + 1] || '';
    if (p === '' || n === '' || !isWord(p) || !isWord(n)) continue; }
  out += c;
}
out = out.trim();
fs.writeFileSync(process.argv[3], out);
console.log(`✅ ${process.argv[2]} → ${process.argv[3]}: ${out.length} B (cap 2045)`);
if (out.length > 2045) process.exit(1);
