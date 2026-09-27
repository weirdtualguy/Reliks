// Reliks v12 browser mint codec v3. Chain-anchored gates; snake/camel-tolerant REST readers.
var MintCodec = (function () {
  'use strict';
  var KASCOV = 'https://kascov.io/data/mainnet/c/';
  var REST = 'https://api.kaspa.org';
  var LANE = '1569a69fd3e82b28ef32d9daea0d1a107cd26a586cf30458416889e689739c09';
  var GENESIS_TX = '029c14e56034353f671ab2abdec244d53dc65bf2298304a533e1d6529badb904';
  var MINT_TX = '9d9342c69446e9d25881c23296b82671350350e3df0d0ec27e155fffea19939c';
  var ED0_COVID = '6f8f076f72ff39eab63b11cd5e5ee3f7d1a9f31e570c4ac3d1ba5e3394146999';
  var ED0_SERIAL = '2884738305227171331';
  var PROGRAM_HASH = '16440384b2b00579d67e1366e8aa9c835e276fbf84a711d4920e87b134d7eaa4';
  var RENDER_HASH = '836c15aecc078e0c19ae71467ff12cdd85a904d1c965a991af095a246dcc403c';
  var ARTIST = '25aafe02662998a62b4b4c1a887005ea8c604705c0a3cb29c3f63dfb85332f8b';
  function hexBytes(h){ var u=new Uint8Array(h.length/2); for(var i=0;i<u.length;i++) u[i]=parseInt(h.substr(i*2,2),16); return u; }
  function toHex(u){ var s=''; for(var i=0;i<u.length;i++) s+=u[i].toString(16).padStart(2,'0'); return s; }
  function utf8(s){ return new TextEncoder().encode(s); }
  function cat(a){ var n=0,i; for(i=0;i<a.length;i++) n+=a[i].length; var o=new Uint8Array(n),off=0; for(i=0;i<a.length;i++){o.set(a[i],off);off+=a[i].length;} return o; }
  function le16(n){ return new Uint8Array([n&255,(n>>>8)&255]); }
  function le32(n){ var b=new Uint8Array(4); for(var i=0;i<4;i++) b[i]=Math.floor(n/Math.pow(2,8*i))%256; return b; }
  function le64(v){ var b=new Uint8Array(8),x=BigInt(v); for(var i=0;i<8;i++){ b[i]=Number(x&255n); x>>=8n; } return b; }
  function pushExp(p){ var n=p.length; if(n===0) return new Uint8Array([0]); if(n<=75) return cat([new Uint8Array([n]),p]); if(n<=255) return cat([new Uint8Array([76,n]),p]); return cat([new Uint8Array([77]),le16(n),p]); }
  function pushMin(p){ var n=p.length; if(n===0) return new Uint8Array([0]); if(n===1){ var b=p[0]; if(b>=1&&b<=16) return new Uint8Array([80+b]); if(b===129) return new Uint8Array([79]); return cat([new Uint8Array([1]),p]); } if(n<=75) return cat([new Uint8Array([n]),p]); if(n<=255) return cat([new Uint8Array([76,n]),p]); return cat([new Uint8Array([77]),le16(n),p]); }
  function pushMinInt(v){ var n=Number(v); if(n===0) return new Uint8Array([0]); if(n>=1&&n<=16) return new Uint8Array([80+n]); if(n===-1) return new Uint8Array([79]); var h=n.toString(16); if(h.length%2) h='0'+h; var a=hexBytes(h); a.reverse(); if(a[a.length-1]&128) return cat([new Uint8Array([a.length+1]),a,new Uint8Array([0])]); return cat([new Uint8Array([a.length]),a]); }
  var IV=[0x6a09e667f3bcc908n,0xbb67ae8584caa73bn,0x3c6ef372fe94f82bn,0xa54ff53a5f1d36f1n,0x510e527fade682d1n,0x9b05688c2b3e6c1fn,0x1f83d9abfb41bd6bn,0x5be0cd19137e2179n];
  var M64=(1n<<64n)-1n;
  var SIGMA=[[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],[14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3],[11,8,12,0,5,2,15,13,10,14,3,6,7,1,9,4],[7,9,3,1,13,12,11,14,2,6,5,10,4,0,15,8],[9,0,5,7,2,4,10,15,14,1,11,12,6,8,3,13],[2,12,6,10,0,11,8,3,4,13,7,5,15,14,1,9],[12,5,1,15,14,13,4,10,0,7,6,3,9,2,8,11],[13,11,7,14,12,1,3,9,5,0,15,4,8,6,2,10],[6,15,14,9,11,3,0,8,12,2,13,7,1,4,10,5],[10,2,8,4,7,6,1,5,15,11,9,14,3,12,13,0],[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],[14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3]];
  function rotr(x,n){ return ((x>>n)|(x<<(64n-n)))&M64; }
  function G(v,a,b,c,d,x,y){ v[a]=(v[a]+v[b]+x)&M64; v[d]=rotr(v[d]^v[a],32n); v[c]=(v[c]+v[d])&M64; v[b]=rotr(v[b]^v[c],24n); v[a]=(v[a]+v[b]+y)&M64; v[d]=rotr(v[d]^v[a],16n); v[c]=(v[c]+v[d])&M64; v[b]=rotr(v[b]^v[c],63n); }
  function compress(h,blk,t,fin){ var m=[],i; for(i=0;i<16;i++){ var x=0n; for(var j=0;j<8;j++) x|=BigInt(blk[i*8+j])<<(BigInt(j)*8n); m[i]=x; }
    var v=h.slice(); v[8]=IV[0];v[9]=IV[1];v[10]=IV[2];v[11]=IV[3];v[12]=IV[4];v[13]=IV[5];v[14]=IV[6];v[15]=IV[7];
    v[12]^=t&M64; v[13]^=(t>>64n)&M64; if(fin) v[14]^=M64;
    for(var r=0;r<12;r++){ var s=SIGMA[r];
      G(v,0,4,8,12,m[s[0]],m[s[1]]); G(v,1,5,9,13,m[s[2]],m[s[3]]); G(v,2,6,10,14,m[s[4]],m[s[5]]); G(v,3,7,11,15,m[s[6]],m[s[7]]);
      G(v,0,5,10,15,m[s[8]],m[s[9]]); G(v,1,6,11,12,m[s[10]],m[s[11]]); G(v,2,7,8,13,m[s[12]],m[s[13]]); G(v,3,4,9,14,m[s[14]],m[s[15]]); }
    for(i=0;i<8;i++) h[i]=(h[i]^v[i]^v[i+8])&M64; }
  function blake2b(msg,opts){ opts=opts||{}; var key=opts.key?utf8(opts.key):new Uint8Array(0); var dk=opts.dkLen||32;
    var h=IV.slice(); h[0]^=BigInt(0x01010000 ^ (key.length<<8) ^ dk);
    var data=key.length?cat([cat([key,new Uint8Array(128-key.length)]),msg]):msg.slice();
    var t=0n,off=0,total=data.length;
    if(total===0){ compress(h,new Uint8Array(128),0n,true); }
    else { while(off<total){ var remain=total-off; if(remain<=128){ var b=new Uint8Array(128); b.set(data.subarray(off,total)); t+=BigInt(remain); compress(h,b,t,true); off=total; } else { compress(h,data.subarray(off,off+128),t+=128n,false); off+=128; } } }
    var out=new Uint8Array(dk); for(var i=0;i<dk;i++) out[i]=Number((h[i>>3]>>(BigInt(i%8)*8n))&255n); return out; }
  var ED=[['ownerIdentifier',32],['identifierType',1],['price',8],['artist',32],['royalty_bips',8],['program_hash',32],['factory_covid',32],['serial',8]];
  var FC=[['program_hash',32],['artist',32],['price',8],['royalty_bips',8],['mints_left',8],['engine_lang',8],['render_hash',32]];
  function encFields(tbl,s){ var out=[]; for(var i=0;i<tbl.length;i++){ var n=tbl[i][0],w=tbl[i][1],v=s[n];
      if(w===8) out.push(pushExp(le64(v))); else if(w===1) out.push(pushExp(new Uint8Array([Number(v)&255]))); else out.push(pushExp(hexBytes(v))); } return cat(out); }
  function encEditionState(s){ return encFields(ED,s); }
  function encFactoryState(s){ return encFields(FC,s); }
  function T(){ return window.RELIKS_TPL; }
  function editionRedeem(s){ var t=T().edition; return cat([hexBytes(t.prefixHex),encEditionState(s),hexBytes(t.suffixHex)]); }
  function factoryRedeem(s){ var t=T().factory; return cat([hexBytes(t.prefixHex),encFactoryState(s),hexBytes(t.suffixHex)]); }
  function p2shSpk(redeem){ return 'aa20'+toHex(blake2b(redeem,{dkLen:32}))+'87'; }
  function p2pkSpk(pk32){ return '20'+pk32+'ac'; }
  function parsePushes(hex){ var b=hexBytes(hex), out=[], o=0;
    while(o<b.length){ var op=b[o++], len;
      if(op===0){ out.push(''); continue; }
      if(op<=75){ len=op; } else if(op===76){ len=b[o++]; } else if(op===77){ len=b[o]+b[o+1]*256; o+=2; }
      else throw new Error('non-push opcode '+op);
      out.push(toHex(b.subarray(o,o+len))); o+=len; }
    return out; }
  function u64(hex){ var b=hexBytes(hex); var v=0n; for(var i=7;i>=0;i--) v=(v<<8n)|BigInt(b[i]); return v; }
  function serialFromOutpoint(txId,index){ var h=blake2b(cat([utf8('ReliksSerialV10'),hexBytes(txId),le32(index)]),{dkLen:32});
    var s=0n; for(var i=0;i<7;i++) s+=BigInt(h[i])*(256n**BigInt(i)); return s+BigInt(h[7]%128)*72057594037927936n; }
  function covIdGenesis(authTxId,authIdx,outs){ var parts=[hexBytes(authTxId),le32(authIdx),le64(outs.length)];
    for(var i=0;i<outs.length;i++){ var o=outs[i],sc=hexBytes(o.script); parts.push(cat([le32(o.idx),le64(o.value),le16(0),le64(sc.length),sc])); }
    return toHex(blake2b(cat(parts),{dkLen:32,key:'CovenantID'})); }
  // ---- tolerant REST readers (mainnet = flat snake_case; older builds = camel/nested) ----
  function pick(o,ks){ for(var i=0;i<ks.length;i++){ if(o && o[ks[i]] != null) return o[ks[i]]; } return undefined; }
  function outSpk(tx,i){ var o=tx.outputs[i]; if(!o) return undefined; var s=pick(o,['script_public_key','scriptPublicKey']);
    if(s && typeof s==='object') s=pick(s,['script_public_key','scriptPublicKey']);
    if(typeof s!=='string') return undefined; return s.slice(0,4)==='0000'?s.slice(4):s; }
  function inOp(tx,i){ var n=tx.inputs[i]; if(!n) return undefined; var p=pick(n,['previous_outpoint','previousOutpoint']); if(p) return { transactionId: pick(p,['transaction_id','transactionId']), index: p.index }; var h=pick(n,['previous_outpoint_hash','previousOutpointHash']); if(h==null) return undefined; return { transactionId: h, index: pick(n,['previous_outpoint_index','previousOutpointIndex']) };
    }
  function covOf(o){ var c=o.covenant;
    if(c && typeof c==='object' && (pick(c,['authorizingInput','authorizing_input'])!=null || pick(c,['covenantId','covenant_id'])!=null))
      return { ai: pick(c,['authorizingInput','authorizing_input']), id: pick(c,['covenantId','covenant_id']) };
    return { ai: pick(o,['covenant_authorizing_input','covenantAuthorizingInput']), id: pick(o,['covenant_id','covenantId']) }; }
  function decodeFactoryRevealed(revealedHex){ var span=T().factory.span;
    var st=parsePushes(revealedHex.slice(span.offset*2,(span.offset+span.len)*2));
    if(st.length!==7) throw new Error('factory state push count '+st.length);
    return { program_hash:st[0], artist:st[1], price:u64(st[2]), royalty_bips:u64(st[3]), mints_left:u64(st[4]), engine_lang:u64(st[5]), render_hash:st[6] }; }
  var LANE_CACHE = null;
  async function laneState(){
    if (LANE_CACHE) return LANE_CACHE;
    var kj = await (await fetch(KASCOV+LANE+'.json')).json();
    var spent = (kj.utxos||[]).filter(function(u){ return u.live===false && u.revealed_hex; });
    var live = (kj.utxos||[]).filter(function(u){ return u.live===true; });
    var kinds = (kj.events||[]).map(function(e){ return e.kind; });
    var transitions = kinds.filter(function(k){ return k==='transition'; }).length;
    if (spent.length!==1 || live.length!==1 || transitions!==1) throw new Error('lane history not single-mint (spent '+spent.length+', live '+live.length+', transitions '+transitions+')');
    if (spent[0].outpoint !== GENESIS_TX+':0') throw new Error('revealed entry is not the genesis lane');
    if (live[0].outpoint !== MINT_TX+':0') throw new Error('live lane is not at the mint continuation');
    var F = decodeFactoryRevealed(spent[0].revealed_hex);
    F.factory_covid = LANE;
    F.mints_left = F.mints_left - 1n;
    F.laneValue = BigInt(kj.live_value != null ? kj.live_value : 100000000);
    F.laneTx = MINT_TX; F.laneIdx = 0;
    F.prevRevealed = spent[0].revealed_hex;
    LANE_CACHE = F;
    return F;
  }
  function buildMint(fState,laneTxId,laneIdx,laneValue,buyerPk,price,buyerTxId,buyerIdx){
    var serial=serialFromOutpoint(laneTxId,laneIdx);
    var edState={ownerIdentifier:buyerPk,identifierType:0,price:0,artist:fState.artist,royalty_bips:fState.royalty_bips,program_hash:fState.program_hash,factory_covid:fState.factory_covid,serial:serial.toString()};
    var edSpk=p2shSpk(editionRedeem(edState));
    var contState={program_hash:fState.program_hash,artist:fState.artist,price:fState.price,royalty_bips:fState.royalty_bips,mints_left:(BigInt(fState.mints_left)-1n).toString(),engine_lang:fState.engine_lang,render_hash:fState.render_hash};
    var contRedeem=factoryRedeem(contState), contSpk=p2shSpk(contRedeem);
    var edCovid=covIdGenesis(buyerTxId,buyerIdx,[{idx:1,value:100000000,script:edSpk}]);
    var outs=[
      {value:Number(laneValue),scriptPublicKey:contSpk,covenant:{authorizingInput:0,covenantId:fState.factory_covid}},
      {value:100000000,scriptPublicKey:edSpk,covenant:{authorizingInput:1,covenantId:edCovid}},
      {value:Number(price),scriptPublicKey:p2pkSpk(fState.artist)}
    ];
    var sig=cat([pushMin(hexBytes(buyerPk)),pushMin(new Uint8Array([0])),pushMinInt(1),pushMinInt(2),pushMin(hexBytes('b781beeb')),pushMin(contRedeem)]);
    return {serial:serial.toString(),edSpk:edSpk,contSpk:contSpk,edCovid:edCovid,outputs:outs,factorySigScript:toHex(sig)};
  }
  var GATES=[];
  async function runGates(){
    GATES.length=0;
    GATES.push(['blake2b empty vector',toHex(blake2b(new Uint8Array(0),{dkLen:32}))==='0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8']);
    var F=null;
    try { F = await laneState(); } catch(e){ console.error('laneState failed: '+e.message); }
    GATES.push(['lane decode vs anchors', !!F && F.program_hash===PROGRAM_HASH && F.artist===ARTIST && F.render_hash===RENDER_HASH && F.mints_left===0n]);
    GATES.push(['spans 161/135', !!F && encEditionState({ownerIdentifier:ARTIST,identifierType:0,price:0,artist:ARTIST,royalty_bips:F.royalty_bips,program_hash:PROGRAM_HASH,factory_covid:LANE,serial:ED0_SERIAL}).length===161 && encFactoryState(F).length===135]);
    try {
      var gtx = await (await fetch(REST+'/transactions/'+GENESIS_TX)).json();
      GATES.push(['revealed redeem hashes to genesis lane spk', !!F && outSpk(gtx,0)===p2shSpk(hexBytes(F.prevRevealed))]);
    } catch(e){ GATES.push(['revealed redeem hashes to genesis lane spk', false]); console.error('genesis gate: '+e.message); }
    GATES.push(['serial oracle', serialFromOutpoint(GENESIS_TX,0).toString()===ED0_SERIAL]);
    var mtx=null;
    try { mtx = await (await fetch(REST+'/transactions/'+MINT_TX)).json(); } catch(e){ console.error('mint tx fetch: '+e.message); }
    if (!mtx){ GATES.push(['G1 edition#0 spk parity',false]); GATES.push(['G2 edition#0 covenant id',false]); }
    else {
      console.log('G2 shape out1='+JSON.stringify(mtx.outputs[1]).slice(0,300));
      var spk1 = outSpk(mtx,1);
      var st={ownerIdentifier:ARTIST,identifierType:0,price:0,artist:ARTIST,royalty_bips:F?F.royalty_bips:500n,program_hash:PROGRAM_HASH,factory_covid:LANE,serial:ED0_SERIAL};
      GATES.push(['G1 edition#0 spk parity', spk1!==undefined && p2shSpk(editionRedeem(st))===spk1]);
      try {
        var cv = covOf(mtx.outputs[1]);
        var po = inOp(mtx, cv.ai);
        var rec = covIdGenesis(po.transactionId, po.index, [{idx:1, value:Number(pick(mtx.outputs[1],['amount','value'])), script:spk1}]);
        console.log('G2 observed authorizingInput='+cv.ai+' | recomputed='+rec.slice(0,16)+'...');
        GATES.push(['G2 edition#0 covenant id', rec===cv.id && rec===ED0_COVID]);
      } catch(e){ GATES.push(['G2 edition#0 covenant id', false]); console.error('G2: '+e.message+' | in0='+JSON.stringify(mtx.inputs[0]).slice(0,200)); }
    }
    window.MINT_READY = GATES.every(function(g){ return g[1]; });
    if(!window.MINT_READY) console.error('MINT CODEC GATES FAILED', GATES); else console.log('MINT CODEC READY', GATES.map(function(g){ return g[0]+(g[1]?'':'!'); }).join(' | '));
    if (window.MintFlow && window.MintFlow.refreshLabel) window.MintFlow.refreshLabel();
  }
  if(document.readyState==='complete') runGates(); else window.addEventListener('load',runGates);
  return {encEditionState:encEditionState,encFactoryState:encFactoryState,editionRedeem:editionRedeem,factoryRedeem:factoryRedeem,p2shSpk:p2shSpk,p2pkSpk:p2pkSpk,parsePushes:parsePushes,serialFromOutpoint:serialFromOutpoint,covIdGenesis:covIdGenesis,buildMint:buildMint,laneState:laneState,decodeFactoryRevealed:decodeFactoryRevealed,outSpk:outSpk,inOp:inOp,covOf:covOf,gates:function(){return GATES;},blake2b:blake2b,hexBytes:hexBytes,toHex:toHex};
})();
