(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.UrenaviFactSafety=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:this),function(){
  'use strict';

  const PROMO_RE=/楽天(?:市場)?(?:総合)?(?:ランキング)?\s*1位|ランキング|受賞|\d+冠|ご好評です|大好評|当店人気|大人気|クーポン|SALE|セール|OFF|オフ|半額|最安|送料無料|ポイント\d*倍|P\d+倍|当日発送|即日発送|発送/i;
  const CLAIM_RE=/改善|予防|防止|安全|安心|無害|保証|発火しない|燃えにくい|難燃|抗菌|除菌|殺菌|消臭|防臭|アレルギー|疲労|痛み|快眠|安眠|健康|小顔|引き締め|リフトアップ|治る|痩せる|若返/i;

  const MATERIALS=new Set([
    '本革','牛革','山羊革','羊革','豚革','合皮','人工皮革','レザー',
    'コットン','綿','綿100%','綿100％','ポリエステル','ナイロン',
    'アルミ','アルミニウム','ステンレス','シリコン','TPU','ABS',
    'ガラス','木製','セラミック'
  ]);

  const STANDARDS=new Set([
    'USB-C','USB C','USB-C対応','USB C対応','Type-C','Type C','Type-C対応','Type C対応','HDMI','DisplayPort','PD対応',
    'Qi','Qi2','Bluetooth','Wi-Fi','WiFi','4K','日本製'
  ]);

  const NUMERIC_UNIT_RE=/^(?:約)?\d+(?:[.,]\d+)?\s*(?:mAh|Ah|Wh|kWh|W|V|A|Hz|kHz|MHz|GHz|mm|cm|m|mg|g|kg|ml|mL|L|oz|インチ|inch|GB|MB|TB)$/i;
  const DIMENSION_RE=/^\d+(?:[.,]\d+)?\s*[x×X]\s*\d+(?:[.,]\d+)?(?:\s*[x×X]\s*\d+(?:[.,]\d+)?)?\s*(?:mm|cm|m)$/i;
  const STRUCTURED_COUNT_RE=/^(?:\d+\s*(?:枚|個|本|袋|箱|組|点|粒|錠|食|包)\s*(?:入|入り|セット|組)|\d+\s*セット)$/i;
  const MULTIPACK_RE=/^\d+\s*(?:枚|個|本|袋|粒|錠)\s*[x×X]\s*\d+\s*(?:枚|個|本|袋|粒|錠)(?:\s*(?:入|入り|セット))?$/i;
  const CONTENT_AMOUNT_RE=/^内容量\s*\d+(?:[.,]\d+)?\s*(?:mAh|Ah|Wh|kWh|W|V|A|Hz|kHz|MHz|GHz|mm|cm|m|mg|g|kg|ml|mL|L|oz|GB|MB|TB)$/i;
  const MATERIAL_WITH_PERCENT_RE=/^(?:綿|コットン|ポリエステル|ナイロン)\s*100[%％]$/i;

  const normalize=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();

  function isAllowedSpecFact(value){
    const x=normalize(value);
    if(!x) return false;
    if(PROMO_RE.test(x)||CLAIM_RE.test(x)) return false;
    if(NUMERIC_UNIT_RE.test(x)||DIMENSION_RE.test(x)||STRUCTURED_COUNT_RE.test(x)||MULTIPACK_RE.test(x)||CONTENT_AMOUNT_RE.test(x)||MATERIAL_WITH_PERCENT_RE.test(x)) return true;
    if(MATERIALS.has(x)||STANDARDS.has(x)) return true;
    return false;
  }

  function numericUnitKey(value){
    const x=normalize(value);
    const m=x.match(/^(?:約)?\d+(?:[.,]\d+)?\s*(mAh|Ah|Wh|kWh|W|V|A|Hz|kHz|MHz|GHz|mm|cm|m|mg|g|kg|ml|mL|L|oz|インチ|inch|GB|MB|TB)$/i);
    return m?String(m[1]||'').toLowerCase():'';
  }

  function filterAllowedSpecFacts(values){
    const input=(Array.isArray(values)?values:[]).map(normalize).filter(Boolean);
    const allowed=input.filter(isAllowedSpecFact);
    const byUnit=new Map();
    for(const x of allowed){
      const key=numericUnitKey(x);
      if(!key) continue;
      if(!byUnit.has(key)) byUnit.set(key,new Set());
      byUnit.get(key).add(x.toLowerCase());
    }
    const ambiguousUnits=new Set([...byUnit.entries()].filter(([,set])=>set.size>1).map(([key])=>key));
    const countFacts=allowed.filter(x=>STRUCTURED_COUNT_RE.test(x)||MULTIPACK_RE.test(x));
    const ambiguousCounts=new Set(countFacts.map(x=>x.toLowerCase())).size>1;
    const out=[];
    for(const x of allowed){
      const unit=numericUnitKey(x);
      if(unit&&ambiguousUnits.has(unit)) continue;
      if(ambiguousCounts&&(STRUCTURED_COUNT_RE.test(x)||MULTIPACK_RE.test(x))) continue;
      if(!out.includes(x)) out.push(x);
    }
    return out;
  }

  return {
    PROMO_RE,CLAIM_RE,MATERIALS,STANDARDS,
    NUMERIC_UNIT_RE,DIMENSION_RE,STRUCTURED_COUNT_RE,MULTIPACK_RE,CONTENT_AMOUNT_RE,MATERIAL_WITH_PERCENT_RE,
    normalize,isAllowedSpecFact,numericUnitKey,filterAllowedSpecFacts
  };
});
