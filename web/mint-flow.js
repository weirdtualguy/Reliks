// Reliks v12 one-tap mint flow (browser). Dry-run: builds + logs; broadcast hop pending Kaspire method confirmation.
var MintFlow = (function () {
  'use strict';
  var sheet = null;
  function kas(n){ return (Number(n)/1e8).toFixed(8); }
  async function refreshLabel(){
    var btn = document.querySelector('.mint-btn'); if(!btn) return;
    try {
      var st = await MintCodec.laneState();
      if (st.mints_left <= 0n){ btn.textContent='Sold Out — Lane Monument'; btn.disabled=true; btn.style.opacity='0.55'; }
      else btn.textContent='Mint Edition ('+st.mints_left.toString()+' left)';
    } catch(e){ btn.title='lane state unavailable: '+e.message; }
  }
  function showSheet(st, buyerPk){
    if(sheet) sheet.remove();
    sheet = document.createElement('div');
    sheet.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
    sheet.innerHTML = '<div style="background:#12141a;border:1px solid #23282e;border-radius:12px;padding:24px;max-width:340px;width:90%;font-family:sans-serif;color:#e8e6e3;">'
      + '<h3 style="margin:0 0 12px;">Mint Review — Zero-Fee</h3>'
      + '<p>Price: <b>'+kas(st.price)+' KAS</b> (100% to artist)</p>'
      + '<p>Royalty baked: <b>'+Number(st.royalty_bips)/100+'%</b></p>'
      + '<p>Edition carrier: 1 KAS (stays in your NFT UTXO)</p>'
      + '<p>Network fee: ~0.035 KAS (node-discovered)</p>'
      + '<p style="color:#8a9199;font-size:12px;">Remaining after this mint: '+(st.mints_left-1n).toString()+'</p>'
      + '<div style="display:flex;gap:12px;margin-top:16px;"><button id="mf-cancel" style="flex:1;padding:10px;background:#1a1c24;color:#e8e6e3;border:none;border-radius:6px;">Cancel</button>'
      + '<button id="mf-go" style="flex:1;padding:10px;background:#49c5b1;color:#000;border:none;border-radius:6px;font-weight:bold;">Sign Mint</button></div></div>';
    document.body.appendChild(sheet);
    sheet.querySelector('#mf-cancel').onclick = function(){ sheet.remove(); sheet=null; TxLifecycle.hide(); };
    sheet.querySelector('#mf-go').onclick = function(){ sheet.remove(); sheet=null; buildAndSign(st, buyerPk); };
  }
  async function buildAndSign(st, buyerPk){
    TxLifecycle.setStep('building','Selecting UTXOs...');
    var addr = ReliksWallet.getAddress();
    var w = await (await fetch('https://api.kaspa.org/addresses/'+addr+'/utxos')).json();
    function normOp(o){ return { transactionId: o.transaction_id || o.transactionId, index: o.index }; }
    function ent(x){ return x.utxoEntry || x; }
    var conf = w.filter(function(x){ return ent(x).blockDaaScore != null || ent(x).block_daa_score != null; });
    conf.sort(function(a,b){ return Number(BigInt(ent(b).amount)-BigInt(ent(a).amount)); });
    var fee = 3500000n, need = st.price + 100000000n + fee, sel = [], tot = 0n;
    for (var i=0;i<conf.length;i++){ sel.push(conf[i]); tot += BigInt(ent(conf[i]).amount); if (tot >= need) break; }
    if (tot < need){ TxLifecycle.error('Insufficient funds: need '+kas(need)+' KAS (price+carrier+fee)'); return; }
    var change = tot - need;
    var bo = normOp(sel[0].outpoint || ent(sel[0]).outpoint);
    var pkg = MintCodec.buildMint(st, st.laneTx, st.laneIdx, st.laneValue, buyerPk, st.price, bo.transactionId, bo.index);
    var inputs = [{ previousOutpoint:{ transactionId: st.laneTx, index: st.laneIdx }, signatureScript: pkg.factorySigScript, sequence:0, sigOpCount:0, computeBudget:60 }];
    sel.forEach(function(u){ inputs.push({ previousOutpoint: normOp(u.outpoint || ent(u).outpoint), signatureScript:'', sequence:0, sigOpCount:0, computeBudget:10 }); });
    var outputs = pkg.outputs.map(function(o){ var r={ value:o.value, scriptPublicKey:o.scriptPublicKey }; if(o.covenant) r.covenant=o.covenant; return r; });
    if (change > 0n) outputs.push({ value:Number(change), scriptPublicKey: MintCodec.p2pkSpk(buyerPk) });
    var tx = { version:1, inputs:inputs, outputs:outputs, lockTime:0, subnetworkId:'00'.repeat(20), gas:0, payload:'' };
    TxLifecycle.setStep('signing','Awaiting Kaspire signature...');
    console.log('RELICS MINT DRY-RUN TX', JSON.stringify(tx));
    if (typeof ReliksWallet.request !== 'function'){ TxLifecycle.error('Wallet request bridge missing (re-run patch-mint-wire)'); return; }
    var idxs = []; for (var k=1;k<inputs.length;k++) idxs.push({ index:k, address:addr });
    try {
      var signed = await ReliksWallet.request('kaspa_signTransaction', { transaction: tx, inputsToSign: idxs });
      console.log('KASPIRE SIGN RESULT', signed);
      TxLifecycle.toast('Signature received — broadcast hop pending method confirmation (dry-run).','info');
      TxLifecycle.setStep('building','Dry-run complete: tx JSON in console');
    } catch(e){ TxLifecycle.error(e.message || String(e)); }
  }
  async function startMint(){
    if (!window.MINT_READY){ TxLifecycle.error('Codec gates not green; refusing to build.'); return; }
    if (!window.ReliksWallet || !ReliksWallet.isConnected()){ TxLifecycle.error('Connect Kaspire first.'); return; }
    TxLifecycle.setStep('building','Reading lane state from chain...');
    try {
      var st = await MintCodec.laneState();
      if (st.mints_left <= 0n){ TxLifecycle.error('Lane exhausted: this series is sold out.'); return; }
      showSheet(st, ReliksWallet.getPubkey());
    } catch(e){ TxLifecycle.error(e.message || String(e)); }
  }
  return { startMint:startMint, refreshLabel:refreshLabel };
})();
