import { execSync } from 'child_process';
import { blake2b } from '@noble/hashes/blake2b';
const CLI = process.env.HOME + '/opt/silverscript/target/release/cli-debugger';
const SIL = process.env.HOME + '/opt/silverscript/contracts/Series.sil';
const hx = (s: string) => (s.startsWith('0x') ? s : '0x' + s);
export interface SeriesState { slot: string; artist: string; price: number; cap: number; role: number; counter: number; owner: string }
export function compileSeries(st: SeriesState): { bytecodeHex: string; scriptPublicKey: string } {
  const raw = [hx(st.slot), hx(st.artist), String(st.price), String(st.cap), String(st.role), String(st.counter), hx(st.owner)];
  const out = execSync(`${CLI} ${SIL} ` + raw.map(v => `--ctor-arg ${v}`).join(' ') + ` --emit-bytecode`, { encoding: 'utf8' });
  const m = out.match(/([0-9a-f]{200,})\s*$/m) || out.match(/Bytecode:\s*([0-9a-f]+)/i);
  if (!m) throw new Error('no bytecode: ' + out.substring(0, 300));
  const bytecodeHex = m[1].trim();
  return { bytecodeHex, scriptPublicKey: 'aa20' + Buffer.from(blake2b(Buffer.from(bytecodeHex, 'hex'), { dkLen: 32 })).toString('hex') + '87' };
}
