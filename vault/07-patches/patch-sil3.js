const fs = require('fs');
const { execSync } = require('child_process');
const p = process.env.HOME + '/opt/silverscript/contracts/Series.sil';
let s = fs.readFileSync(p, 'utf8');
s = s.split(': (State, State) {').join(': (State[]) {');
const oldRet = s.slice(s.indexOf('        return (State {'), s.indexOf('    }', s.indexOf('        return (State {')) + 5);
const locals = [
'        State child = State { slot: prev_state.slot, artist: prev_state.artist, price: 0, cap: prev_state.cap,',
'            role: ROLE_EDITION, counter: prev_state.counter, ownerIdentifier: buyerIdentifier, identifierType: buyerScheme };',
'        State cont = State { slot: prev_state.slot, artist: prev_state.artist, price: prev_state.price, cap: prev_state.cap,',
'            role: ROLE_SERIES, counter: prev_state.counter + 1, ownerIdentifier: prev_state.ownerIdentifier, identifierType: prev_state.identifierType };',
].join('\n');
const setVariant = (ret) => fs.writeFileSync(p, s.split(oldRet).join(locals + '\n        ' + ret + '\n'));
const S = JSON.parse(fs.readFileSync('series.json', 'utf8'));
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const CLI = process.env.HOME + '/opt/silverscript/target/release/cli-debugger';
const SIL = process.env.HOME + '/opt/silverscript/contracts/Series.sil';
const hx = (x) => (x.startsWith('0x') ? x : '0x' + x);
const cmd = `${CLI} ${SIL} --ctor-arg ${hx(S.slotHex)} --ctor-arg ${hx(USER)} --ctor-arg 100000000 --ctor-arg 64 --ctor-arg 0 --ctor-arg 0 --ctor-arg ${hx(USER)} --emit-bytecode`;
for (const [name, ret] of [['State[]{ child, cont }', 'return State[]{ child, cont };'], ['[child, cont]', 'return [child, cont];']]) {
  setVariant(ret);
  try { execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); console.log('✅ compiled with array literal: ' + name); process.exit(0); }
  catch (e) { console.log('variant ' + name + ' failed: ' + (e.stderr || '').toString().split('\n')[0]); }
}
process.exit(1);
