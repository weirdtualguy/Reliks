const fs = require('fs');
const { execSync } = require('child_process');

// 1. Compile the new edition (using your existing dummy args for constructor params)
console.log('1. Compiling ReliksEdition-v10.sil...');
const dummyArgs = fs.existsSync('data/edition-dummy-args.json') ? 'data/edition-dummy-args.json' : 'data/edition-args-v4.json';
execSync(`${process.env.SILVERC || 'silverc'} sil/ReliksEdition-v10.sil --constructor-args ${dummyArgs} -o data/edition-abi-v5.json`, { stdio: 'inherit' });

// 2. Extract new template metadata
const edAbi = JSON.parse(fs.readFileSync('data/edition-abi-v5.json', 'utf8'));
const contract = Object.values(edAbi.contracts)[0]; // ReliksEdition
const bytecode = Buffer.from(contract.compiled.bytecode);
const span = contract.compiled.state_span;

const prefixLen = span.offset;
const suffixLen = bytecode.length - (span.offset + span.len);
const templateHashHex = Buffer.from(contract.compiled.template_hash).toString('hex');
const templateHashBytes = Array.from(Buffer.from(contract.compiled.template_hash));

console.log('\n✅ NEW EDITION TEMPLATE METADATA:');
console.log('   templatePrefixLen:', prefixLen);
console.log('   templateSuffixLen:', suffixLen);
console.log('   expectedTemplateHash:', templateHashHex);
console.log('\n   JSON snippet for factory-args-v10.json:');
console.log('   {"kind": "bytes", "value":', JSON.stringify(templateHashBytes), '}');

console.log('\n3. MANUAL STEP: Update data/factory-args-v10.json');
console.log('   - Find the old templatePrefixLen and replace with:', prefixLen);
console.log('   - Find the old templateSuffixLen and replace with:', suffixLen);
console.log('   - Find the old expectedTemplateHash (32-byte array) and replace with the JSON snippet above.');

console.log('\n4. Recompile the factory with the updated args:');
console.log('   silverc sil/SeriesFactory-v10.sil --constructor-args data/factory-args-v10.json -o data/factory-abi-v10.json');

console.log('\n5. Redeploy the series (the factory bytecode has changed, so program_hash and genesis tx will be new):');
console.log('   node deploy-v10.js');
