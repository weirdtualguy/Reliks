const fs = require('fs');
const artBytes = fs.readFileSync('art-program.bin', 'utf8');
const ledger = JSON.parse(fs.readFileSync('factory-ledger-art.json', 'utf8'));

console.log(`Found ${ledger.counter} minted edition(s).`);
for (let serial = 0; serial < ledger.counter; serial++) {
  // Inject the serial into the JS seed variable
  const html = artBytes.replace('window.SERIAL||0', `${serial}`);
  fs.writeFileSync(`edition-${serial}.html`, html);
  console.log(`✅ Rendered edition-${serial}.html`);
}
console.log('\n🎨 Open the HTML files in your browser to view the generative art!');
