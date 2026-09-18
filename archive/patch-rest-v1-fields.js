const fs = require('fs');
for (const file of ['v7-lib.js', 'offer-lib.js']) {
  let s = fs.readFileSync(file, 'utf8');
  const A = "}, i.computeBudget !== undefined ? { computeBudget: i.computeBudget } : {})),";
  const AN = "}, { computeBudget: (i.computeBudget || i.compute_budget || 0), compute_budget: (i.computeBudget || i.compute_budget || 0) })),";
  const B = "}, o.covenant ? { covenant: o.covenant } : {}));";
  const BN = "}, o.covenant ? { covenant: Object.assign({}, o.covenant, { authorizing_input: o.covenant.authorizingInput, covenant_id: o.covenant.covenantId }) } : {}));";
  if (!s.includes(A) || !s.includes(B)) { console.log('❌ anchors missing in', file); process.exit(1); }
  s = s.split(A).join(AN).split(B).join(BN);
  fs.writeFileSync(file, s);
  console.log('✅', file, 'now sends computeBudget+compute_budget and dual-named covenant bindings');
}
