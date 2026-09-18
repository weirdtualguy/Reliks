const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const [,, addr, pub] = process.argv;
const body = addr.split(':')[1];
const groups = [...body].map(c => CHARSET.indexOf(c));
if (groups.some(g => g < 0)) throw new Error('non-base32 character in address');
const pG = groups.slice(0, 53); // payload: version(1)+pubkey(32) = 264 bits -> 53 groups
const cG = groups.slice(53);
function fromBits(g, from, to) { let acc = 0, bits = 0; const out = []; const maxv = (1 << to) - 1; for (const v of g) { acc = ((acc << from) | v) >>> 0; bits += from; while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); } } return out; }
const payload = Buffer.from(fromBits(pG, 5, 8));
console.log('version byte:', payload[0], '(expect 0 = schnorr P2PK)');
console.log('embedded pubkey:', payload.slice(1, 33).toString('hex'));
console.log(payload.slice(1, 33).toString('hex') === pub ? '✅ ADDRESS COMMITS TO YOUR KEY' : '❌ pubkey mismatch');
console.log('checksum groups:', cG.length, '(informational only; network already validated the string)');
