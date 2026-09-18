const L = require('./offer-lib.js');
const fakeTx = {
  version: 0,
  inputs: [],
  outputs: [],
  lockTime: 0,
  subnetworkId: '0000000000000000000000000000000000000000'
};
(async () => {
  console.log('Testing REST broadcast endpoint...');
  const res = await fetch(L.rest + '/transactions?replaceByFee=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: fakeTx, allowOrphan: true })
  });
  console.log('Status:', res.status);
  const txt = await res.text();
  console.log('Response:', txt.slice(0, 400));
})();
