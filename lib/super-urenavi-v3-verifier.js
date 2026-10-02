'use strict';

function compact(value=''){
  return String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();
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
      required:['verificationIndex','supported','keepDirectFact','reason'],
      properties:{
        verificationIndex:{type:'integer',minimum:0,maximum:2},
        supported:{type:'boolean'},
        keepDirectFact:{type:'boolean'},
        reason:{type:'string',maxLength:160}
      }
    }}
  }
};

const PASS2_SYSTEM_PROMPT=`あなたは商品の訴求推論を独立に検証する審査役です。入力には原文引用に紐づいた属性と、提案された訴求だけが渡されます。1回目のAIの理由付けは信用せず、各訴求が引用された属性だけから無理なく言えるかを判定してください。supported=true は、一般の購入者に誤解を与えず、その訴求・scene・noHassleが属性と引用から直接言える場合だけです。型番を電力や容量と解釈する、対応サイズを収納寸法と解釈する、計量範囲を本体重量と解釈するなど、属性の意味を変える推論は必ずfalseにしてください。条件付き仕様の条件を落とす、複数選択肢を単一仕様として断定することもfalseです。supported=falseでも、引用された事実自体をそのまま残せるならkeepDirectFact=trueにしてください。商品種別と原文全体の用途を必ず照合してください。原文にない使用場面、おすすめ対象、感情、生活変化はfalseです。sceneは引用で確認できる用途の具体化だけを認めます。noHassleは引用が明示する内容に限り、それ以外はfalse。便利・快適・時短等への拡張は禁止。グローブは用途を照合し、掃除用・スポーツ用・医療用をバイク用に転用しないでください。バイク用でスマホ操作を示すなら停車中に限定します。sceneとtextが同じ用途や仕様を言い換えて繰り返すだけの場合もfalseです。商品種別の説明だけで固有仕様との関係がないものを選ぶ理由として承認しないでください。JSONだけを返してください。`;

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
    verifiedByAppealIndex.set(input.appealIndex,{
      supported:result.supported===true,
      keepDirectFact:result.keepDirectFact!==false,
      reason:compact(result.reason).slice(0,160)
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
  pickAppealsForVerification,buildVerificationInput,applyVerification
};
