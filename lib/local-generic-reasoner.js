'use strict';

const DISCLOSURE='※アフィリエイト広告を利用しています';

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

const SIGNALS=[
  {re:/^(?:折りたたみ|折り畳み)$/,axis:'収納形態',hook:'収納時の形も確認して選びたいとき',body:(id,q)=>`${q}仕様の${id}です。`,score:10},
  {re:/^食洗機対応$/,axis:'お手入れ',hook:'お手入れ方法も確認して選びたいとき',body:(id,q)=>`${q}の${id}です。`,score:10},
  {re:/^洗える$/,axis:'お手入れ',hook:'お手入れ方法も確認して選びたいとき',body:(id,q)=>`${q}${id}です。`,score:10},
  {re:/^(?:充電式|コードレス)$/,axis:'電源方式',hook:'電源方式も確認して選びたいとき',body:(id,q)=>`${q}の${id}です。`,score:9},
  {re:/^(?:USB-C|USB-C対応|Type-C|Type-C対応)$/,axis:'端子',hook:'接続端子も確認して選びたいとき',body:(id,q)=>`${q}表記の${id}です。`,score:9},
  {re:/^(?:防水|撥水)$/,axis:'仕様',hook:'使う環境に関わる仕様も確認して選びたいとき',body:(id,q)=>`${q}仕様の${id}です。`,score:8},
  {re:/^(?:メッシュ|ステンレス|シリコン|アルミ|アルミニウム|木製|ガラス|セラミック|本革|レザー|ナイロン|ポリエステル|コットン|綿)$/,axis:'素材・構造',hook:'素材や構造も確認して選びたいとき',body:(id,q)=>`${q}を使った${id}です。`,score:7},
  {re:/^(?:キャスター付き|マグネット式|壁掛け|粘着式)$/,axis:'設置・構造',hook:'設置方法や構造も確認して選びたいとき',body:(id,q)=>`${q}の${id}です。`,score:7},
  {re:/^(?:日本製)$/,axis:'生産情報',hook:'生産情報も確認して選びたいとき',body:(id,q)=>`${q}の${id}です。`,score:3}
];

function numericMeta(quote=''){
  const q=normalize(quote);
  if(/^\d+(?:\.\d+)?\s*(?:ml|mL|L|mAh|Ah|Wh|GB)$/i.test(q)) return {axis:'容量',hook:'容量表記も確認して選びたいとき',body:(id)=>`${q}表記の${id}です。`,score:6};
  if(/^\d+(?:\.\d+)?\s*(?:mm|cm|m)(?:[×xX]\d+(?:\.\d+)?\s*(?:mm|cm|m)){1,2}$/i.test(q)) return {axis:'サイズ',hook:'サイズ表記も確認して選びたいとき',body:(id)=>`${q}表記の${id}です。`,score:7};
  if(/^\d+(?:\.\d+)?\s*(?:mm|cm|m|インチ)$/i.test(q)) return {axis:'サイズ',hook:'サイズ表記も確認して選びたいとき',body:(id)=>`${q}表記の${id}です。`,score:5};
  if(/^\d+(?:\.\d+)?\s*(?:kg|mg|g)$/i.test(q)) return {axis:'重量・内容量',hook:'重さや内容量の表記も確認して選びたいとき',body:(id)=>`${q}表記の${id}です。`,score:4};
  if(/^\d+(?:\.\d+)?\s*(?:W|V|A)$/i.test(q)) return {axis:'電力仕様',hook:'電力仕様も確認して選びたいとき',body:(id)=>`${q}表記の${id}です。`,score:4};
  if(/^\d+(?:枚|個|本|袋|組|点|粒|錠|箱|足)(?:入り|入|セット|組)?$/.test(q)) return {axis:'入り数',hook:'入り数も確認して選びたいとき',body:(id)=>`${q}の${id}です。`,score:6};
  return null;
}

function candidateFromFact(fact,identity){
  const quote=normalize(fact?.quote);
  if(!quote) return null;
  for(const rule of SIGNALS){
    if(rule.re.test(quote)) return {quote,axis:rule.axis,hook:rule.hook,body:rule.body(identity,quote),score:rule.score,kind:'signal'};
  }
  const numeric=numericMeta(quote);
  if(numeric) return {quote,axis:numeric.axis,hook:numeric.hook,body:numeric.body(identity),score:numeric.score,kind:'numeric'};
  return null;
}

function composeGenericLocalCopy({identity='',facts=[],itemPrice=0}={}){
  const id=normalize(identity);
  if(!id||!Array.isArray(facts)||!facts.length) return null;
  const candidates=facts.map(f=>candidateFromFact(f,id)).filter(Boolean).sort((a,b)=>b.score-a.score);
  const best=candidates[0];
  if(!best) return null;
  if(best.quote==='日本製'&&candidates.length===1) return null;
  const rows=[best.hook+'。',best.body];
  if(Number(itemPrice)>0) rows.push('',`価格：${Number(itemPrice).toLocaleString('ja-JP')}円`);
  rows.push('',DISCLOSURE);
  return {
    text:rows.join('\n'),hook:best.hook,hookType:'scene',quote:best.quote,
    axis:best.axis,kind:best.kind,reasoningVersion:'2026-10-04-generic-purchase-angle-v1'
  };
}

module.exports={normalize,numericMeta,candidateFromFact,composeGenericLocalCopy};
