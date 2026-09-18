const fs = require('fs');
let c = fs.readFileSync('verify-factory-edition.js', 'utf8');
c = c.split("factory.contract.entries['__covenant_entrypoint_auth_mint']")
     .join("factory.contract.entries['mint']");
fs.writeFileSync('verify-factory-edition.js', c);
console.log('patched entrypoint name -> mint');
