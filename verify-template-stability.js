const fs = require('fs');
const { execSync } = require('child_process');
const os = require('os');
const path = require('path');
const SILVERC = path.join(os.homedir(), 'opt/silverscript/target/release/silverc');
const SIL = path.join(os.homedir(), 'opt/silverscript/contracts/Edition.sil');
function compile(args, tag) {
  const argsPath = path.join(os.tmpdir(), `ed-${tag}-args.json`);
  const outPath = path.join(os.tmpdir(), `ed-${tag}-abi.json`);
  fs.writeFileSync(argsPath, JSON.stringify(args));
  execSync(`${SILVERC} ${SIL} --constructor-args ${argsPath} -o ${outPath}`, { encoding: 'utf8' });
  const c = JSON.parse(fs.readFileSync(outPath, 'utf8')).contracts['Edition'];
  return { template_hash: Buffer.from(c.compiled.template_hash).toString('hex'),
           state_span: c.compiled.state_span, bytecode_len: c.compiled.bytecode.length };
}
const z = new Array(32).fill(0), o = new Array(32).fill(1);
const mk = (id, owner, price, artist, ph, cov, serial) => [
  { kind:'bytes', value: owner }, { kind:'byte', value: id }, { kind:'int', value: price },
  { kind:'bytes', value: artist }, { kind:'int', value: 500 }, { kind:'bytes', value: ph },
  { kind:'bytes', value: cov }, { kind:'int', value: serial } ];
const A = compile(mk(0, z, 0, z, z, z, 0), 'A');
const B = compile(mk(0, o, 100000000, o, o, o, 5), 'B');
console.log('A:', JSON.stringify(A));
console.log('B:', JSON.stringify(B));
console.log('template_hash stable:', A.template_hash === B.template_hash ? 'YES ✓' : 'NO ✗');
console.log('state_span   stable:', JSON.stringify(A.state_span) === JSON.stringify(B.state_span) ? 'YES ✓' : 'NO ✗');
