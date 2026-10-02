(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.UrenaviStructuredCopy=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const VERSION='structured-copy-20261002-v1';
  const normalize=x=>String(x||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  const split=x=>normalize(x).split(/[\s【】〖〗（）()「」『』\[\]{}・／/\\|｜,:：;；!！?？★☆※。]+/).filter(Boolean);
  const RISK=/ランキング|受賞|楽天.*1位|送料無料|クーポン|半額|最安|SALE|改善|予防|防止|安全|安心|無害|保証|難燃|抗菌|除菌|殺菌|消臭|防臭|臭わない|アレルギー|疲労|痛み|快眠|安眠|健康|小顔|リフトアップ|痩せ|若返|美白|治療|効果|効能|最強|最高|絶対|必ず/i;
  const MODIFIER=/^(?:非|不|未|フェイク|不要|なし|無し|別売|付属|対応しない|非対応|風|調|柄|タッチ|ライク|プリント)$/;
  const BAD_CONTEXT=/非対応|対応不可|対応しない|非防|防.*ではない|非スマホ|非対応|含まない|付属しない|ご購入|購入で|購入時|個目|個から|あたり|当たり|場合|対象外|ではありません|ではない|無し|なし|不要|別売|除く|除外|フェイク/;
  const MATERIALS=['山羊革','牛革','羊革','豚革','本革','レザー','合皮','人工皮革','綿100%','コットン','綿','ポリエステル','ナイロン','ステンレス','シリコン','アルミ','アルミニウム','木製','ガラス','セラミック','ABS','TPU'];
  const FUNCTIONS=['スマホ対応','防風','防水','撥水','オールシーズン','メッシュ','折りたたみ','折り畳み','収納付き','キャスター付き','コードレス','充電式','洗える','手洗い','IH対応','電子レンジ対応','食洗機対応','USB-C','USB-C対応','Type-C','Type-C対応','HDMI','HDMI対応','PD対応','Bluetooth','Wi-Fi','4K','日本製','冷凍','個包装','レトルト','回転式','長袖','半袖','春夏','秋冬','壁掛け','粘着式','マグネット式','フィルター交換不要'];
  const TYPES=[
    {names:['タオル'],scene:'手や体を拭くときに。',domain:'towel'},
    {names:['財布','IDカードケース','HDMIケーブル','ケーブル','スクエアボックスプール'],scene:'',domain:'daily'},
    {names:['バイクグローブ','バイク用グローブ','バイク手袋'],scene:'バイクに乗るときの手元に。',domain:'riding'},
    {names:['モバイルバッテリー'],scene:'外出先での充電に。',domain:'charging'},
    {names:['空調服用バッテリー','空調服バッテリー'],scene:'空調服に使うバッテリーを探している方に。',domain:'special-power'},
    {names:['収納ベンチ'],scene:'座る場所と収納を一緒に用意したいときに。',domain:'storage-seat'},
    {names:['モップハンガー','モップホルダー'],scene:'掃除道具のモップを掛けておく場所に。',domain:'holder'},
    {names:['毛取りグローブ','抜け毛取りグローブ'],scene:'ペットの毛を取るときに。',domain:'grooming',requires:/ペット|犬|猫|ネコ/},
    {names:['うんち袋','ウンチ袋','マナー袋','袋'],scene:'ペットの排泄物を入れる袋に。',domain:'pet-bag',requires:/犬|猫|ネコ|ペット|うんち|ウンチ/},
    {names:['美顔ローラー','美容ローラー'],scene:'顔のお手入れに使うローラーを探している方に。',domain:'beauty'},
    {names:['フライパン','鍋','キッチンバサミ','包丁','まな板'],scene:'キッチンでの調理に。',domain:'cooking'},
    {names:['収納ボックス','収納ケース','収納ラック'],scene:'ものを入れる収納を用意したいときに。',domain:'storage'},
    {names:['かっさ','ヘアブラシ','コーム','メイクブラシ'],scene:'日々のお手入れに使う道具に。',domain:'beauty'},
    {names:['ペットベッド','犬用ベッド','猫用ベッド'],scene:'ペットが過ごす場所に。',domain:'pet'},
    {names:['パジャマ','ボクサーパンツ','Tシャツ','シャツ','パーカー','パンツ','靴下'],scene:'日々の着替えに。',domain:'clothing'},
    {names:['電気ケトル'],scene:'お湯を沸かすときに。',domain:'kettle'},
    {names:['扇風機','サーキュレーター'],scene:'室内で風を送るときに。',domain:'fan'},
    {names:['掃除機','電動モップ'],scene:'床の掃除に。',domain:'cleaning'},
    {names:['レトルトカレー','カレー','スープ','米','コーヒー','お茶'],scene:'',domain:'food'}
  ];
  function sourceParts(item){return ['itemName','itemCaption'].map(source=>({source,text:normalize(item?.[source])})).filter(x=>x.text);}
  function occurrence(parts,quote){
    const q=normalize(quote); if(!q||RISK.test(q)||(BAD_CONTEXT.test(q)&&q!=='フィルター交換不要')) return null;
    for(const part of parts){
      const tokens=split(part.text);
      for(let i=0;i<tokens.length;i++){
        if(tokens[i]!==q && !(q.includes(' ')&&part.text.includes(q)) && !(tokens[i].startsWith(q)&&/^(?:を採用|を使用|を使|採用|です|として)/.test(tokens[i].slice(q.length)))) continue;
        // A term must be an entire source token; nearby negation, conditions and material modifiers reject it.
        if(MODIFIER.test(tokens[i-1]||'')||MODIFIER.test(tokens[i+1]||'')) continue;
        const at=part.text.indexOf(q);
        const before=part.text.slice(Math.max(0,at-5),at);
        const after=part.text.slice(at+q.length,at+q.length+15);
        if(/(?:非|不|未|フェイク)\s*$/.test(before)||/^(?:\s*(?:ではない|ではありません|非対応|非防水|不要|なし|無し|別売|を除く|対象外|をご購入|ご購入|購入で|から|あたり|当たり|目))/.test(after)) continue;
        return {quote:q,source:part.source};
      }
    }
    return null;
  }
  // A: identity and scenes are lexical product definitions, never personal claims or model-written targets.
  function understand(item,identity=''){
    const title=normalize(item?.itemName),compact=title.replace(/\s+/g,'');
    if(identity&&!sourceParts(item).some(x=>x.text.replace(/\s+/g,'').includes(normalize(identity).replace(/\s+/g,'')))) return {identity:'',scene:'',domain:'',reason:'ungrounded_identity'};
    const candidates=[];
    for(const type of TYPES) for(const name of type.names){
      if(compact.includes(name)&&(!type.requires||type.requires.test(title))&&!(compact.split(name)[1]||'').match(/^(?:用)?(?:ケース|カバー|交換パーツ)/)) candidates.push({...type,name});
    }
    const parents={'storage-seat':['storage']};
    candidates.sort((a,b)=>(parents[b.domain]?.length||0)-(parents[a.domain]?.length||0)||b.name.length-a.name.length);
    const winner=candidates[0];
    const domains=new Set(candidates.map(x=>x.domain));
    // Nested category names are fine, unrelated product types are ambiguous.
    const conflict=[...domains].some(x=>x!==winner?.domain&&!(parents[winner?.domain]||[]).includes(x));
    if(conflict) return {identity:'',scene:'',domain:'',reason:'conflicting_types'};
    if(winner) return {identity:winner.name,scene:winner.scene,domain:winner.domain,reason:''};
    const id=normalize(identity);
    if(id&&!RISK.test(id)&&!BAD_CONTEXT.test(id)&&sourceParts(item).some(x=>x.text.includes(id))) return {identity:id,scene:'',domain:'unknown',reason:''};
    return {identity:'',scene:'',domain:'',reason:'unknown_type'};
  }
  // B: every extracted fact carries its exact quote and source. Images are never inferred here.
  function extractFacts(item,evidence=[]){
    const parts=sourceParts(item),out=[];
    const specs=new Set([...MATERIALS,...FUNCTIONS]);
    const numeric=/^(?:内容量)?\d+(?:\.\d+)?(?:mAh|Wh|W|V|A|mm|cm|kg|g|ml|mL|L|GB|インチ)$/;
    const count=/^\d+(?:枚|個|本|袋|組|食|包|点)(?:入り|入|セット|組)$/;
    const dimensions=/^\d+(?:\.\d+)?[×xX]\d+(?:\.\d+)?(?:[×xX]\d+(?:\.\d+)?)?(?:cm|mm)$/;
    const specPhrase=/^(?:Bluetooth \d+(?:\.\d+)?|最大\d+時間再生|\d+段階温度調節|\d+時間保温|回転式\d+枚刃|\d+(?:\.\d+)?リットル(?:大容量)?|\d+-\d+度|\d+℃単位|(?:重量|幅|奥行|高さ) \d+(?:\.\d+)?(?:g|kg|mm|cm))$/;
    const sizes=/^(?:XS|S|M|L|LL|XL|XXL|XXXL|[2-5]XL)$/;
    const candidates=[...parts.flatMap(x=>split(x.text)),...evidence.map(x=>typeof x==='object'?x.quote:x)];
    for(const raw of candidates){
      const q=normalize(raw);
      if(!specs.has(q)&&!numeric.test(q)&&!count.test(q)&&!dimensions.test(q)&&!sizes.test(q)&&!specPhrase.test(q)) continue;
      const match=occurrence(parts,q); if(!match) continue;
      const kind=MATERIALS.includes(q)?'material':FUNCTIONS.includes(q)?'function':count.test(q)?'count':dimensions.test(q)?'dimension':sizes.test(q)?'size':'numeric';
      out.push({...match,kind});
    }
    return dedupeFacts(out);
  }
  function semanticKey(q){
    if(/^(本革|レザー|山羊革|牛革|羊革|豚革)$/.test(q)) return 'leather';
    if(/^(綿|コットン|綿100%)$/.test(q)) return 'cotton';
    if(/^(折りたたみ|折り畳み)$/.test(q)) return 'fold';
    if(/^(USB-C|USB-C対応|Type-C|Type-C対応)$/.test(q)) return 'usb-c';
    if(/^Bluetooth(?: \d+(?:\.\d+)?)?$/.test(q)) return 'bluetooth';
    if(/^(?:重量|幅|奥行|高さ|内容量) /.test(q)) return q.replace(/^(?:重量|幅|奥行|高さ|内容量) /,'').toLowerCase();
    if(q==='XXL'||q==='2XL') return 'size-2xl';
    if(q==='XXXL'||q==='3XL') return 'size-3xl';
    return q.toLowerCase();
  }
  function dedupeFacts(rows){
    const unique=new Map();
    const score=q=>/^(?:重量|幅|奥行|高さ|内容量) |^Bluetooth /.test(q)?4:/山羊革|牛革|羊革|豚革|100%|対応/.test(q)?3:q==='本革'?2:1;
    for(const row of rows){const key=semanticKey(row.quote),prev=unique.get(key);if(!prev||score(row.quote)>score(prev.quote)) unique.set(key,row);}
    // Different capacities/counts/material types are not silently resolved.
    const units=new Map();
    for(const row of unique.values()){
      const unit=row.kind==='count'?'count':row.kind==='numeric'?(row.quote.match(/[a-zA-Z]+|インチ$/)||[])[0]:row.kind==='dimension'?'dimension':'';
      if(unit){if(!units.has(unit)) units.set(unit,new Set());units.get(unit).add(row.quote);}
    }
    const conflicting=new Set([...units].filter(([,v])=>v.size>1).flatMap(([,v])=>[...v]));
    const leather=[...unique.values()].filter(x=>semanticKey(x.quote)==='leather');
    const real=[...rows].filter(x=>/^(山羊革|牛革|羊革|豚革)$/.test(x.quote));
    if(new Set(real.map(x=>x.quote)).size>1) for(const x of leather) conflicting.add(x.quote);
    return [...unique.values()].filter(x=>!conflicting.has(x.quote)).slice(0,10);
  }
  // C: bounded functional entailments, each linked to one fact and a compatible domain.
  function valuesFor(understanding,facts){
    const out=[];
    for(const fact of facts){
      let text='';
      if(fact.quote==='スマホ対応'&&understanding.domain==='riding') text='停車中のスマホ操作にも対応。';
      if(fact.quote==='防風'&&understanding.domain==='riding') text='走行時の風対策にも。';
      if((fact.quote==='IH対応')&&understanding.domain==='cooking') text='IHでの調理に対応。';
      if((fact.quote==='食洗機対応')&&understanding.domain==='cooking') text='使用後は食洗機で洗えます。';
      if(text) out.push({text,factRef:fact.quote,source:fact.source});
    }
    return out;
  }
  function compose(item,{identity='',evidence=[]}={}){
    const understanding=understand(item,identity),facts=extractFacts(item,evidence).filter(x=>x.kind!=='size'||['riding','clothing'].includes(understanding.domain)),values=valuesFor(understanding,facts);
    if(!understanding.identity||!facts.length) return {version:VERSION,understanding,facts,values,text:'',status:'insufficient_evidence'};
    const used=new Set(values.map(x=>x.factRef));
    const materials=facts.filter(x=>x.kind==='material');
    const lead=understanding.scene;
    const introduction=materials.length?materials.map(x=>x.quote).join('・')+'を使った'+understanding.identity+'です。':understanding.identity+'です。';
    for(const x of materials) used.add(x.quote);
    const lines=lead?[lead,'',introduction]:[introduction];
    if(values.length) lines.push(values.map(x=>x.text).join(''));
    const remaining=facts.filter(x=>!used.has(x.quote));
    if(remaining.length){lines.push('','特徴👇');for(const x of remaining) lines.push('✓ '+x.quote);}
    const price=Number(item?.itemPrice);if(Number.isFinite(price)&&price>0) lines.push('','価格：'+new Intl.NumberFormat('ja-JP').format(price)+'円');
    lines.push('','※アフィリエイト広告を利用しています');
    const text=lines.join('\n');
    if(text.length>500) return {version:VERSION,understanding,facts,values,text:'',status:'length_overflow'};
    return {version:VERSION,understanding,facts,values,text,status:'ok'};
  }
  return {VERSION,understand,extractFacts,dedupeFacts,valuesFor,compose,RISK};
});
