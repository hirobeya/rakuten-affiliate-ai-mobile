(function(root){
  'use strict';

  const VERSION='shadow-v2-20260921';
  const FEATURE_FLAGS={genericFull:false,benefitCopy:false,queryCanPromote:false};

  const norm=s=>String(s||'').normalize('NFKC').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();

  const ROLE_PATTERNS={
    promo:[
      /(?:楽天|ランキング)\s*1位/g,/\d+冠/g,/クーポン(?:利用)?/g,/\d+%\s*OFF/gi,/セール|SALE/gi,/ポイント\s*\d+倍|P\d+倍/gi
    ],
    target:[
      /犬用|猫用|ネコ用|ペット用|家庭用|車用|業務用|子供用|大人用/g
    ],
    use_context:[
      /車中泊|アウトドア|キャンプ|防災|停電|通院|旅行|お出かけ|後部座席|助手席|玄関|浴室|網戸|キッチン|リビング/g
    ],
    accessory:[
      /(?:ソーラーパネル|ケース|カバー|ポーチ|バッグ|リード|ベルト|ストラップ|ケーブル|パッド|フック|アダプター|ホルダー|スタンド)(?:付き|付属|セット)?/g
    ],
    spec:[
      /(?<![\d,])\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:Wh|W|mAh|Pa|kg|g|cm|mm|L|ml)\b/gi,
      /(?<![\d,])\d{4,}(?:\.\d+)?\s*(?:Wh|W|mAh|Pa|kg|g|cm|mm|L|ml)\b/gi,
      /(?:SS|S|M|L|LL|XL|XXL)\s*サイズ/gi,
      /\d+\s*(?:枚|個|本|袋|箱|組|点)\s*(?:セット|入り|入)/g
    ],
    feature:[
      /コードレス|充電式|折りたたみ|折り畳み|防水|撥水|洗える|丸洗い|食洗機対応|乾燥機対応|ドラム式対応|USB-?C|Type-?C|LEDライト(?:付き|付)?|コンパクト|スリム|薄型|滑り止め(?:加工)?/gi
    ]
  };

  const PRODUCT_NOUN_PATTERNS=[
    /ドライブベッドキャリー|ドライブベッド|ドライブボックス|ペットベッド|犬用ベッド|猫用ベッド/g,
    /ハンディー?クリーナー|ハンディ掃除機|小型掃除機|電動モップ|回転モップクリーナー|電動フロアワイパー|モップハンガー/g,
    /ポータブル電源|モバイルバッテリー|Power\s*Bank|PowerBank|洗濯ネット|ランドリーネット/g,
    /収納ベンチ|ベンチボックス|ランドリーバスケット|洗濯かご|ランドリーボックス|キッチンワゴン|収納ワゴン/g,
    /モバイルバッテリー用[^\s]{0,16}(?:ケース|ポーチ|カバー)|Power\s*Bank\s*(?:Case|ケース|ポーチ|カバー)|PowerBank\s*(?:Case|ケース|ポーチ|カバー)/gi,
    /加湿器|電気ケトル|USBハブ|折りたたみ傘|ペット給水器|フライパン|水筒|枕|まな板/g,
    /[ァ-ヶーA-Za-z0-9一-龯]{2,20}(?:クリーナー|ベッド|ボックス|ケース|ネット|ワゴン|ケトル|加湿器|給水器|ハブ|傘|水筒|枕|まな板|フライパン)/g
  ];

  const PRODUCT_FAMILY_RULES=[
    {family:'accessory.powerbank_case',re:/モバイルバッテリー用[^\s]{0,16}(?:ケース|ポーチ|カバー)|Power\s*Bank\s*(?:Case|ケース|ポーチ|カバー)|PowerBank\s*(?:Case|ケース|ポーチ|カバー)/i},
    {family:'cleaning.mop',re:/電動モップ|回転モップクリーナー|電動フロアワイパー|モップクリーナー|回転モップ/},
    {family:'cleaning.vacuum',re:/ハンディー?クリーナー|ハンディ掃除機|小型掃除機|コードレス掃除機/},
    {family:'charging.mobile_battery',re:/モバイルバッテリー|Power\s*Bank|PowerBank/i},
    {family:'charging.portable_power',re:/ポータブル電源/},
    {family:'pet.drive_bed',re:/ドライブベッドキャリー|ドライブベッド|ドライブボックス|車用ベッド/},
    {family:'pet.bed',re:/ペットベッド|犬用ベッド|猫用ベッド|犬ベッド|猫ベッド/},
    {family:'storage.bench',re:/収納ベンチ|ベンチボックス|収納スツール/},
    {family:'laundry.basket',re:/ランドリーバスケット|洗濯かご|ランドリーボックス/},
    {family:'storage.wagon',re:/キッチンワゴン|収納ワゴン|ワゴン収納/},
    {family:'laundry.net',re:/洗濯ネット|ランドリーネット/},
  ];

  function productFamily(text){
    const t=norm(text);
    const hit=PRODUCT_FAMILY_RULES.find(x=>x.re.test(t));
    return hit?hit.family:'';
  }

  function dedupeSpans(spans){
    const seen=new Set(),out=[];
    for(const s of spans){
      const key=[s.role,s.start,s.end,s.text].join('|');
      if(seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out;
  }

  function collectSpans(title){
    const spans=[];
    const add=(role,m,meta={})=>{
      const text=String(m[0]||'');
      const start=Number(m.index);
      if(!text || !Number.isFinite(start)) return;
      spans.push({role,text,start,end:start+text.length,source:'title',...meta});
    };
    for(const [role,patterns] of Object.entries(ROLE_PATTERNS)){
      for(const re0 of patterns){
        const re=new RegExp(re0.source,re0.flags.includes('g')?re0.flags:re0.flags+'g');
        let m;
        while((m=re.exec(title))) add(role,m);
      }
    }
    for(const re0 of PRODUCT_NOUN_PATTERNS){
      const re=new RegExp(re0.source,re0.flags.includes('g')?re0.flags:re0.flags+'g');
      let m;
      while((m=re.exec(title))) add('product_noun',m,{candidate:true});
    }
    spans.sort((a,b)=>a.start-b.start || (b.end-b.start)-(a.end-a.start));
    return dedupeSpans(spans);
  }

  function pickPrimaryProduct(spans,title){
    const candidates=spans.filter(s=>s.role==='product_noun');
    if(!candidates.length) return null;
    const accessories=spans.filter(s=>s.role==='accessory');
    const scored=candidates.map(c=>{
      const accessoryOverlap=accessories.some(a=>Math.max(a.start,c.start)<Math.min(a.end,c.end));
      const family=productFamily(c.text);
      const isAccessoryProduct=family.startsWith('accessory.');
      const nestedAccessoryProduct=candidates.some(other=>other!==c && productFamily(other.text).startsWith('accessory.') && other.start<=c.start && other.end>=c.end);
      const earlyBonus=c.start<=24?30:Math.max(0,20-Math.floor(c.start/5));
      const specificity=Math.min(30,c.text.length*2);
      const score=earlyBonus+specificity+(isAccessoryProduct?18:0)-(accessoryOverlap&&!isAccessoryProduct?35:0)-(nestedAccessoryProduct?50:0);
      return {...c,score,accessoryOverlap,family,nestedAccessoryProduct};
    }).sort((a,b)=>b.score-a.score || a.start-b.start || b.text.length-a.text.length);
    const best=scored[0];
    return {
      text:best.text,start:best.start,end:best.end,source:'title',
      method:'title_product_noun',score:best.score,
      grounded:title.slice(best.start,best.end)===best.text
    };
  }

  function queryConsistency(title,query,primary){
    const q=norm(query);
    if(!q) return {value:'',role:'constraint_only',status:'absent',canPromote:false};
    const compact=s=>norm(s).replace(/\s+/g,'').toLowerCase();
    const titleText=compact(title),qText=compact(q),primaryText=compact(primary?.text||'');
    const inTitle=titleText.includes(qText);
    const directAligned=!!primary && (primaryText.includes(qText)||qText.includes(primaryText));
    const queryFamily=productFamily(q);
    const primaryFamily=productFamily(primary?.text||'');
    const familyAligned=!!primary && !!queryFamily && queryFamily===primaryFamily;
    const aligned=directAligned||familyAligned;
    return {
      value:q,
      role:'constraint_only',
      status:aligned?'aligned':inTitle?'present_not_primary':'mismatch',
      inTitle,
      alignedWithPrimary:aligned,
      familyAligned,
      queryFamily,
      primaryFamily,
      canPromote:false
    };
  }

  function touchesOrOverlaps(a,b,maxGap=0){
    if(Math.max(a.start,b.start)<Math.min(a.end,b.end)) return true;
    const gap=Math.max(b.start-a.end,a.start-b.end,0);
    return gap<=maxGap;
  }

  function validateSpans(title,spans,primary,query){
    const invalid=spans.filter(s=>s.start<0||s.end>title.length||title.slice(s.start,s.end)!==s.text);
    const scopeIssues=[];
    const attrs=spans.filter(s=>['feature','spec','target','use_context'].includes(s.role));
    const accessories=spans.filter(s=>s.role==='accessory');
    for(const attribute of attrs){
      for(const accessory of accessories){
        if(touchesOrOverlaps(attribute,accessory,0)){
          scopeIssues.push({type:'attribute_accessory_scope',attribute,accessory});
        }
      }
    }
    const q=queryConsistency(title,query,primary);
    return {
      allSpansGrounded:invalid.length===0,
      invalidSpans:invalid,
      scopeIssues,
      queryMismatch:q.status!=='absent' && q.status!=='aligned',
      query:q,
      primaryGrounded:!!primary?.grounded,
      eligibleForGenericFull:false,
      factOnly:true
    };
  }

  function shadowFacts(spans,validation){
    if(!validation.allSpansGrounded) return [];
    const bad=new Set();
    for(const issue of validation.scopeIssues){
      bad.add([issue.attribute.role,issue.attribute.start,issue.attribute.end].join('|'));
    }
    return spans
      .filter(s=>['feature','spec','target','use_context'].includes(s.role))
      .filter(s=>!bad.has([s.role,s.start,s.end].join('|')))
      .map(s=>({text:s.text,role:s.role,start:s.start,end:s.end,source:'title'}))
      .filter((x,i,a)=>a.findIndex(y=>y.text===x.text&&y.role===x.role)===i)
      .slice(0,8);
  }

  function analyze(item,query=''){
    const title=norm(item?.itemName||'');
    const spans=collectSpans(title);
    const primaryProduct=pickPrimaryProduct(spans,title);
    const validation=validateSpans(title,spans,primaryProduct,query);
    return {
      version:VERSION,
      mode:'shadow',
      featureFlags:{...FEATURE_FLAGS},
      source:{title},
      query:validation.query,
      primaryProduct,
      spans,
      facts:shadowFacts(spans,validation),
      validation,
      recommendation:{
        existingOutputMustRemainUnchanged:true,
        shadowDecision:!primaryProduct?'fallback':validation.queryMismatch?'fallback':'fact_only_shadow',
        reason:!primaryProduct?'no_grounded_primary_product':validation.queryMismatch?'query_product_mismatch':'grounded_primary_product'
      }
    };
  }

  root.UrenaviProductShadowV2={
    analyze,collectSpans,pickPrimaryProduct,queryConsistency,validateSpans,
    featureFlags:{...FEATURE_FLAGS}
  };
})(typeof window!=='undefined'?window:globalThis);
