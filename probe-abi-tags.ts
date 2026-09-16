import * as fs from 'fs';
import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';

const SILVERC = path.join(os.homedir(), 'opt/silverscript/target/release/silverc');
const SIL = path.join(os.homedir(), 'opt/silverscript/contracts/Series.sil');
const ARGS = 'series-v4.args.json';
const ABI_OUT = 'series-v4.abi.json';

// Known-good tags from factory4 ledger + handoff
const KNOWN: Record<string, string> = {
  mint: 'b8a2310c', list: '5703f99d', buy: '9909be01', sell: '951976a2', spend: '2b00e75d',
};
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const F = JSON.parse(fs.readFileSync('factory4.json', 'utf8'));
const hexToBytes = (hex: string) => Array.from(Buffer.from(hex, 'hex'));

// 1. Constructor args — Series.v4.sil order:
//    program_art(byte[2048]) artist_id(byte[32]) price(int) cap(int) role(byte) counter(int) owner(byte[32])
const artBytes = hexToBytes(F.slotHex);
if (artBytes.length !== 2048) console.log(`⚠️ art slot is ${artBytes.length} B, expected 2048`);
const args = [
  { kind: 'bytes', value: artBytes },
  { kind: 'bytes', value: hexToBytes(USER) },
  { kind: 'int',   value: 100000000 },
  { kind: 'int',   value: 64 },
  { kind: 'byte',  value: 0 },
  { kind: 'int',   value: 0 },
  { kind: 'bytes', value: hexToBytes(USER) },
];
fs.writeFileSync(ARGS, JSON.stringify(args));
console.log(`✅ ${ARGS} written (art = ${artBytes.length} B)`);

// 2. Compile with silverc → ABI JSON artifact
try {
  execSync(`${SILVERC} ${SIL} --constructor-args ${ARGS} -o ${ABI_OUT}`, { encoding: 'utf8' });
} catch (e: any) {
  console.log('❌ silverc failed:', (e.stderr || e.message).toString().substring(0, 500));
  process.exit(1);
}
const abi = JSON.parse(fs.readFileSync(ABI_OUT, 'utf8'));
const contract = abi.contracts.Series;
if (!contract) { console.log('❌ no Series in ABI. contracts:', Object.keys(abi.contracts)); process.exit(1); }

// 3. Show the name mapping + every emitted tag
console.log('\n📛 cov_decl_to_abi (source decl → ABI entry):');
for (const [src, abiName] of Object.entries<any>(contract.cov_decl_to_abi || {})) console.log(`   ${src} → ${abiName}`);
const tagByAbiName: Record<string, string> = {};
console.log('\n🏷️  entries (ABI entry → dispatch_tag):');
for (const [abiName, entry] of Object.entries<any>(contract.entries)) {
  tagByAbiName[abiName] = entry.dispatch_tag;
  console.log(`   ${abiName} → ${entry.dispatch_tag}`);
}

// 4. Resolve source names → tags, compare to known-good
console.log('\n🔍 dispatch-tag verification vs factory4 ledger:');
let allMatch = true;
for (const src of ['mint', 'list', 'buy', 'sell', 'spend']) {
  const abiName = (contract.cov_decl_to_abi || {})[src] || src;
  const tag = tagByAbiName[abiName] || tagByAbiName[src];
  const ok = tag === KNOWN[src];
  if (!ok) allMatch = false;
  console.log(`   ${ok ? '✅' : '❌'} ${src.padEnd(6)} silverc=${tag}  known=${KNOWN[src]}`);
}
console.log(allMatch
  ? '\n🎉 ALL TAGS MATCH — the ABI JSON is the new source of truth; probe-v4.ts can retire to a fallback.'
  : '\n⚠️ mismatch — inspect above before trusting silverc tags.');
