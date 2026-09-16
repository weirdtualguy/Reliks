const fs = require('fs');
let c = fs.readFileSync('src/factory-deploy.ts', 'utf8');
c = c.split("const d: any = await (await fetch('https://kascov.io/data/testnet-10/deploy'")
     .join(`let d: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { d = await (await fetch('https://kascov.io/data/testnet-10/deploy'`);
c = c.split("body: JSON.stringify({ program_hex: prog, value: 1000000000 }) })).json();")
     .join(`body: JSON.stringify({ program_hex: prog, value: 1000000000 }) })).json();
      if (d.covenant_id) break;
    } catch (e) { console.log('  retry', attempt + 1, (e as any).code); await new Promise(r => setTimeout(r, 2000)); }
  }
  if (!d || !d.covenant_id) { console.log('❌ deploy failed'); process.exit(1); }`);
fs.writeFileSync('src/factory-deploy.ts', c);
console.log('✅ deploy retry loop added');
