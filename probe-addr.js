(async () => {
  const txid = process.argv[2] || 'd0939fa58d7f41d880a5b0084325f276251fcd942bf70e685ccd999df654d246';
  try {
    const j = await (await fetch('https://kascov.io/data/testnet-10/tx/' + txid + '.json')).json();
    console.log('tx top keys:', Object.keys(j).join(','));
    const outs = j.outputs || (j.transaction && j.transaction.outputs) || [];
    console.log('sample output:', JSON.stringify(outs[2] || outs[0] || {}).slice(0, 500));
  } catch (e) { console.log('tx probe err:', e.message); }
  try {
    const t = await (await fetch('https://rps.sealver.stream/assets/wasm-D540j6pw.js')).text();
    console.log('rps wasm chunk bytes:', t.length);
    console.log('exports tail:', t.slice(-300));
  } catch (e) { console.log('rps probe err:', e.message); }
})();
