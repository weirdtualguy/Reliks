const { blake3 } = require('@noble/hashes/blake3');
const tag = (s) => Buffer.from(blake3(s).slice(0, 4)).toString('hex');
const want = 'f0c7626f';
for (const c of ['spend(int)', '__covenant_entrypoint_auth_spend(int)', 'spend']) {
  const t = tag(c);
  console.log((t === want ? '✅ MATCH  ' : '          ') + c + ' → ' + t);
}
