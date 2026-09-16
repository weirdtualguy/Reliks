const fs = require('fs');
let c = fs.readFileSync('verify-factory-edition.js', 'utf8');

// runtime-state fields use JSON key "type", not "ty"
c = c.split('field.ty').join('field.type');

// ArtEdition now carries factory_covid; map it in the sample builder
const throwLine = "    throw new Error('no sample value mapping for field: ' + field.name);";
const covCase  = "    if (lname.includes('factory_covid') || lname.includes('covid')) return Buffer.alloc(32);\n";
if (!c.includes('factory_covid')) {
  c = c.split(throwLine).join(covCase + throwLine);
}

fs.writeFileSync('verify-factory-edition.js', c);
console.log('patched verify-factory-edition.js');
