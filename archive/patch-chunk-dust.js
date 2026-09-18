const fs = require('fs');
['art-commit-v7.js', 'reveal-v5.js'].forEach(f => {
  if (!fs.existsSync(f)) return;
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('CHUNK_DUST')) { console.log('skip', f); return; }
  const inject = "const CHUNK_DUST = BigInt(process.env.PC_CHUNK_DUST || '100000000');\n";
  const match = s.match(/^const.*require.*$/m);
  s = match ? s.replace(match[0], match[0] + '\n' + inject) : inject + s;
  s = s.replace(/800000000n/g, '(CHUNK_DUST * 8n)').replace(/100000000n/g, 'CHUNK_DUST');
  fs.writeFileSync(f, s);
  console.log('patched', f);
});
