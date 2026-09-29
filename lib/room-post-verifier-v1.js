'use strict';

const VERIFIER_MODEL='openai/gpt-oss-20b';
const VERIFY_SCHEMA={
  type:'object',additionalProperties:false,
  required:['safe','keep_indices','reasons'],
  properties:{
    safe:{type:'boolean'},
    keep_indices:{type:'array',items:{type:'integer'},maxItems:12},
    reasons:{type:'array',items:{type:'string',maxLength:160},maxItems:12}
  }
};

function outputText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text;
  for(const out of data?.output||[]){
    if(out?.type!=='message')continue;
    for(const c of out?.content||[])if(typeof c?.text==='string'&&c.text.trim())return c.text;
  }
  return '';
}
function splitSentences(text=''){
  return String(text||'').split(/(?<=[。！？!?])\s*|\n+/).map(x=>x.trim()).filter(Boolean);
}
function verifierPrompt({sourceText,sentences}){
  return `あなたは楽天ROOM投稿文の事実監査だけを行う。指定JSONだけ返す。\n\n【入力元】\n${sourceText}\n\n【監査対象】\n${sentences.map((s,i)=>`${i}: ${s}`).join('\n')}\n\n【判定】\n- keep_indices には、入力元に直接書かれている事実、またはその機能から一段で直接導ける単純な操作上の便益だけを残す。\n- 入力元にない性能、効果、体感、場所、季節、対象者、他機器、使用環境、安心・安全、便利さの理由を追加した文は落とす。\n- 常識的に正しそうでも入力元に書かれていなければ落とす。\n- 例: 92g→軽くて疲れにくい/持ち運びやすい は落とす。IPX4→シャワー中・濡れた手・水洗い・安心 は落とす。USB充電→PC/モバイルバッテリー/車内/旅行先/コンセント不要 は落とす。刃数→よく剃れる/肌に優しい は落とす。1℃単位→味が良くなる/安定する は落とす。\n- 例: スマホ対応→グローブを外さずスマホ操作、200枚入り→買い足し回数を減らしたい、折りたたみ式→使わない時にたためる、は直接の操作・数量関係なので残してよい。\n- 文の一部だけ危険なら文全体を落とす。書き換えはしない。\n- safe=true は、残す文だけで投稿して問題ない時。`;
}
async function verifyPost({apiKey,sourceText,postText,fetchImpl=fetch}){
  const sentences=splitSentences(postText);
  if(!sentences.length)return{safe:false,keepIndices:[],reasons:['本文なし'],postText:''};
  const r=await fetchImpl('https://api.groq.com/openai/v1/responses',{
    method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      model:VERIFIER_MODEL,reasoning:{effort:'low'},
      input:[{role:'user',content:[{type:'input_text',text:verifierPrompt({sourceText,sentences})}]}],
      text:{format:{type:'json_schema',name:'urenavi_room_verify_v1',strict:true,schema:VERIFY_SCHEMA}},
      max_output_tokens:420
    })
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(data?.error?.message||`Verifier failed (${r.status})`);e.status=r.status;e.retryAfter=r.headers?.get?.('retry-after')||null;throw e;}
  const text=outputText(data);if(!text)throw new Error('Verifier returned no structured output');
  const raw=JSON.parse(text);
  const keep=[...new Set((Array.isArray(raw.keep_indices)?raw.keep_indices:[]).filter(i=>Number.isInteger(i)&&i>=0&&i<sentences.length))].sort((a,b)=>a-b);
  const kept=keep.map(i=>sentences[i]);
  return{safe:raw.safe===true&&kept.length>0,keepIndices:keep,reasons:Array.isArray(raw.reasons)?raw.reasons:[],postText:kept.join('\n'),raw};
}

module.exports={VERIFIER_MODEL,VERIFY_SCHEMA,splitSentences,verifierPrompt,verifyPost};
