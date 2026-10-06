'use strict';

function compact(value=''){
  return String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function draftSentences(appeal){
  return [appeal?.scene,appeal?.text,appeal?.noHassle].flatMap(x=>(compact(x).match(/[^。！？]+[。！？]?/g)||[]).map(compact)).filter(Boolean);
}

function pickAppealsForVerification(validation,{limit=3}={}){
  const appeals=Array.isArray(validation?.appeals)?validation.appeals:[];
  return appeals
    .filter(x=>x?.needsVerification===true)
    .sort((a,b)=>(b.strength||0)-(a.strength||0) || (a.index||0)-(b.index||0))
    .slice(0,Math.max(0,Math.min(3,Number(limit)||3)));
}

function buildVerificationInput(validation,{limit=3}={}){
  const attributes=Array.isArray(validation?.attributes)?validation.attributes:[];
  const picked=pickAppealsForVerification(validation,{limit});
  return picked.map((appeal,verificationIndex)=>({
    verificationIndex,
    appealIndex:appeal.index,
    ...(validation?.semanticDraft?{sentences:draftSentences(appeal)}:{}),
    proposed:{
      text:compact(appeal.text),
      noHassle:compact(appeal.noHassle),
      scene:compact(appeal.scene)
    },
    attributes:appeal.attributeRefs.map(i=>{
      const a=attributes[i]||{};
      return {
        ref:i,
        name:compact(a.name),
        value:compact(a.value),
        unit:compact(a.unit),
        qualifier:compact(a.qualifier),
        quote:compact(a.quote)
      };
    })
  }));
}

const PASS2_SCHEMA={
  type:'object',additionalProperties:false,
  required:['results'],
  properties:{
    results:{type:'array',maxItems:3,items:{
      type:'object',additionalProperties:false,
      required:['verificationIndex','supported','keepDirectFact','reason','checks'],
      properties:{
        verificationIndex:{type:'integer',minimum:0,maximum:2},
        supported:{type:'boolean'},
        keepDirectFact:{type:'boolean'},
        reason:{type:'string',maxLength:100},
        checks:{type:'array',maxItems:6,items:{type:'object',additionalProperties:false,required:['sentence','supported','evidenceQuotes','reason'],properties:{sentence:{type:'string',maxLength:200},supported:{type:'boolean'},evidenceQuotes:{type:'array',maxItems:3,items:{type:'string',maxLength:240}},reason:{type:'string',maxLength:80}}}}
      }
    }}
  }
};

const PASS2_SYSTEM_PROMPT=`あなたは完成したROOM投稿の最終事実・安全性審査役です。商品種別と、各段落に紐づけられた引用根拠、完成文(scene/text/noHassle)だけを照合します。入力に含まれていない商品原文を想像・補完してはいけません。supported=trueは、段落内の全ての事実・用途・条件・対象・程度・否定が、添付されたattributes.quoteだけで支持される場合に限ります。
sceneの「〜したいとき」「〜用を選ぶなら」は仮定の使用意図ですが、その用途・対象・場面自体が添付引用から直接導ける必要があります。別の場所に書いてあるはず、一般常識として自然、商品カテゴリ的にありそう、という理由ではtrueにしないでください。例えば「シングル布団が入る大容量」という引用だけでは「ドラム式で洗う場面」は支持されません。「型崩れを防ぐ」という引用だけでは「旅行先」という場面は支持されません。
一文に複数の主張があれば、一つでも引用で支えられなければfalseです。数量、単位、対象、用途、互換性、条件、否定、程度、乾燥機/ドラム式などの機種条件を必ず個別に確認してください。複数の別条件を勝手に結合してはいけません。「ドラム式対応」と「乾燥機対応」は別主張です。「型崩れ防止」から「型崩れしない」と断定してはいけません。「便利」「安心」「おすすめ」「楽々」などの評価語も、添付引用が直接支えない限りfalseです。
性能や効果の拡張は禁止です。「快適」は「疲れにくい」の根拠にならず、「柔らかい」は「滑りにくい」の根拠にならず、素材や保護部品は清潔さ・身体効果・保温性能の根拠にはなりません。生活結果の保証、新しい性能・効果、速さ・耐久・医療・美容効果、体験談、感情の決めつけは認めません。「対応」は用途・機種・条件を保つ必要があります。否定の反転、条件の省略、型番を容量として読む、範囲や選択肢を一つと断定する、商品用途を別カテゴリに転用する場合はfalse。運転中のスマホ等の操作はfalse。運転用装備のスマホ操作は停車中が文中に必要です。
入力の全verificationIndexに一件ずつsupported/keepDirectFact/reasonを返してください。各入力sentencesの全てについてchecksを1件ずつ返してください。sentenceは入力文そのもの、supportedはその文にある全主張が添付引用で支えられる場合だけtrue、evidenceQuotesはその入力のattributes.quoteから抜き出した連続引用だけを返してください。入力外の引用を新しく持ち込んではいけません。supported全体はchecksが全てtrueの時だけtrue。JSONだけ。`;


function applyVerification(validation,rawResult){
  const appeals=Array.isArray(validation?.appeals)?validation.appeals:[];
  const verificationInput=buildVerificationInput(validation);
  const results=Array.isArray(rawResult?.results)?rawResult.results:[];
  const byVerificationIndex=new Map();
  for(const row of results){
    if(!Number.isInteger(row?.verificationIndex)) continue;
    byVerificationIndex.set(row.verificationIndex,row);
  }

  const verifiedByAppealIndex=new Map();
  verificationInput.forEach((input,i)=>{
    const result=byVerificationIndex.get(i);
    if(!result) return;
    let complete=true;
    if(validation?.semanticDraft){
      const expected=input.sentences||[],checks=Array.isArray(result.checks)?result.checks:[];
      const quoted=input.attributes.map(a=>compact(a.quote));
      complete=expected.length>0 && checks.length===expected.length && expected.every(sentence=>{
        const matches=checks.filter(c=>compact(c?.sentence)===sentence);
        if(matches.length!==1 || matches[0].supported!==true) return false;
        const evidence=matches[0].evidenceQuotes;
        return Array.isArray(evidence)&&evidence.length>0&&evidence.every(q=>compact(q)&&quoted.some(source=>source.includes(compact(q))));
      });
    }
    verifiedByAppealIndex.set(input.appealIndex,{
      supported:result.supported===true && complete,
      keepDirectFact:result.keepDirectFact!==false,
      reason:complete?compact(result.reason).slice(0,160):'incomplete_or_unsupported_sentence_checks',
      ...(validation?.semanticDraft?{checks:result.checks||[]}: {})
    });
  });

  return appeals.map(appeal=>{
    if(!appeal?.needsVerification){
      return {...appeal,verification:{required:false,supported:true,keepDirectFact:true,reason:'direct_fact'}};
    }
    const v=verifiedByAppealIndex.get(appeal.index);
    if(!v){
      return {...appeal,verification:{required:true,supported:false,keepDirectFact:true,reason:'missing_verification'}};
    }
    return {...appeal,verification:{required:true,...v}};
  });
}

module.exports={
  PASS2_SCHEMA,PASS2_SYSTEM_PROMPT,
  draftSentences,pickAppealsForVerification,buildVerificationInput,applyVerification
};
