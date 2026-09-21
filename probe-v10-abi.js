const { blake2b } = require('@noble/hashes/blake2b');
const A = require('./data/factory-abi-v10.json');
const E = require('./reliks-engine-v10.js');
const args = require('./data/factory-args-v10.json');
const c = A.contracts[Object.keys(A.contracts)[0]];
const bc = Array.isArray(c.compiled.bytecode) ? Buffer.from(c.compiled.bytecode) : Buffer.from(c.compiled.bytecode, 'hex');
const eng = Buffer.from(E.ENGINE_SRC, 'utf8');
const st = bc.subarray(c.compiled.state_span.offset, c.compiled.state_span.offset + c.compiled.state_span.len);
const inBc = bc.includes(eng);
const s0 = st[0] === 0x20 && st.subarray(1, 33).toString('hex') === E.engineHashHex;
const argH = Buffer.from(blake2b(Buffer.from(args[5].value), { dkLen: 32 })).toString('hex');
const argsOk = argH === Buffer.from(args[0].value).toString('hex');
console.log('bc:', bc.length, '| engine in bytecode:', inBc, '| state[0] ok:', s0, '| args self-consistent:', argsOk, '| engine bytes:', eng.length);
console.log('forensics | old engine("relic(") baked:', bc.includes(Buffer.from('function relic(')), '| new engine("reliks(") baked:', bc.includes(Buffer.from('function reliks(')));
console.log('tags:', Object.fromEntries(Object.entries(c.entries).map(([k, v]) => [k, v.dispatch_tag])));
if (!(inBc && s0 && argsOk && bc.length >= 4130)) { console.error('V10 ABI DIRTY — do not deploy'); process.exit(1); }
console.log('V10 ABI CLEAN');
