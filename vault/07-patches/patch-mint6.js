const fs = require('fs');
let c = fs.readFileSync('src/mint-edition.ts', 'utf8');
// Find the line with the unit count check and save findings for the best tag
c = c.split("console.log(`tag ${tagHex} → ${pf.verdict} | ${un}u | ${(pf.executed?.[0]?.verdict || pf.findings?.[0]?.message || '').substring(0, 70)}`);")
     .join(`console.log(\`tag \${tagHex} → \${pf.verdict} | \${un}u | \${(pf.executed?.[0]?.verdict || pf.findings?.[0]?.message || '').substring(0, 70)}\`);
    if (un > 4900) { fs.writeFileSync('best-findings.json', JSON.stringify({ tag: tagHex, units: un, findings: pf.findings, executed: pf.executed }, null, 2)); }`);
fs.writeFileSync('src/mint-edition.ts', c);
console.log('✅ save findings for tags with >4900 units');
