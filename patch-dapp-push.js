const fs = require('fs');
let s = fs.readFileSync('web/index.html', 'utf8');
const reps = [
  ["tagOf(FP.c,'mint'),pe(cat(", "pe(tagOf(FP.c,'mint')),pe(cat("],
  ["tagOf(EP.c,'buy'),pe(oldRedeem)", "pe(tagOf(EP.c,'buy')),pe(oldRedeem)"],
  ["tagOf(EP.c,'list'),pe(oldRedeem)", "pe(tagOf(EP.c,'list')),pe(oldRedeem)"],
  ["tagOf(EP.c,'sell'),pe(oldRedeem)", "pe(tagOf(EP.c,'sell')),pe(oldRedeem)"],
  ["tagOf(EP.c,'transfer'),pe(oldRedeem)", "pe(tagOf(EP.c,'transfer')),pe(oldRedeem)"],
  ["hexb(wSig(inputs,outputs,1+k))", "hexb(pe(wSig(inputs,outputs,1+k)))"],
];
for (const [a, b] of reps) {
  if (!s.includes(a)) { console.error('missing:', a); process.exit(1); }
  s = s.split(a).join(b);
}
fs.writeFileSync('web/index.html', s);
console.log('✅ dispatch tags + wallet sigs now push-framed in all five actions');
