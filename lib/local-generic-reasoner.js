'use strict';

const {selectBestCandidate,shouldPublish,axisFamily}=require('./partner-decision-kernel');

const DISCLOSURE='※アフィリエイト広告を利用しています';

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

// Cross-category operators only. These convert an explicit source feature into a
// buyer decision axis without inventing an outcome, audience, or product use.
const SIGNALS=[
  {terms:['伸縮式','伸縮'],axis:'可変構造',hook:'長さを変えて使いたいなら',body:(id,q)=>`${q}仕様の${id}です。`,score:11},
  {terms:['高さ調整','高さ調節'],axis:'高さ調整',hook:'高さを変えて使いたいなら',body:(id,q)=>`${q}に対応した${id}です。`,score:11},
  {terms:['角度調整','角度調節'],axis:'角度調整',hook:'角度を変えて使いたいなら',body:(id,q)=>`${q}に対応した${id}です。`,score:11},
  {terms:['リモコン付き','リモコン付'],axis:'操作方法',hook:'操作方法まで見て選ぶなら',body:(id,q)=>`${q}の${id}です。`,score:10},
  {terms:['三脚一体型','三脚付き'],axis:'設置・構造',hook:'置き方や設置方法まで見て選ぶなら',body:(id,q)=>`${q}の${id}です。`,score:10},
  {terms:['折りたたみ','折り畳み'],axis:'収納形態',hook:'折りたためる形で選びたいなら',body:(id,q)=>`${q}仕様の${id}です。`,score:10},
  {terms:['食洗機対応'],axis:'お手入れ',hook:'食洗機対応で選びたいなら',body:(id,q)=>`${q}の${id}です。`,score:10},
  {terms:['洗える'],axis:'お手入れ',hook:'洗えるタイプで選びたいなら',body:(id,q)=>`${q}${id}です。`,score:10},
  {terms:['USB-C対応','USB-C','Type-C対応','Type-C'],axis:'端子',hook:'接続端子まで見て選ぶなら',body:(id,q)=>`${q}表記の${id}です。`,score:9},
  {terms:['Bluetooth対応','Bluetooth'],axis:'接続方式',hook:'接続方式まで見て選ぶなら',body:(id,q)=>`${q}表記の${id}です。`,score:9},
  {terms:['防水','撥水'],axis:'仕様',hook:'使う環境に関わる仕様まで見て選ぶなら',body:(id,q)=>`${q}仕様の${id}です。`,score:8},
  {terms:['メッシュ','ステンレス','シリコン','アルミ','アルミニウム','木製','ガラス','セラミック','本革','レザー','ナイロン','ポリエステル','コットン','綿'],axis:'素材・構造',hook:'素材まで見て選ぶなら',body:(id,q)=>`${q}を使った${id}です。`,score:7},
  {terms:['キャスター付き','マグネット式','壁掛け','粘着式'],axis:'設置・構造',hook:'設置方法まで見て選ぶなら',body:(id,q)=>`${q}の${id}です。`,score:7},
  {terms:['日本製'],axis:'生産情報',hook:'生産情報まで見て選ぶなら',body:(id,q)=>`${q}の${id}です。`,score:3}
];

function numericMeta(quote=''){
  const q=normalize(quote);
  if(/^最大\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)$/i.test(q)) return {axis:'可変範囲',hook:'長さの上限まで見て選ぶなら',body:(id)=>`${q}表記の${id}です。`,score:8};
  if(/^\d+(?:\.\d+)?\s*(?:mm|cm|m)(?:[×xX]\d+(?:\.\d+)?\s*(?:mm|cm|m)){1,2}$/i.test(q)) return {axis:'サイズ',hook:'サイズまで見て選ぶなら',body:(id)=>`${q}表記の${id}です。`,score:7};
  if(/^\d+(?:枚|個|本|袋|組|点|粒|錠|箱|足)(?:入り|入|セット|組)?$/.test(q)) return {axis:'入り数',hook:'入り数まで見て選ぶなら',body:(id)=>`${q}の${id}です。`,score:6};
  if(/^\d+(?:\.\d+)?\s*(?:mAh|Ah|Wh|W|V|A|mm|cm|m|kg|mg|g|ml|mL|L|GB|インチ)$/i.test(q)) return {axis:'数値仕様',hook:'数値仕様まで見て選ぶなら',body:(id)=>`${q}表記の${id}です。`,score:4};
  return null;
}

function candidateFromFact(fact,identity){
  const quote=normalize(fact?.quote);
  if(!quote) return null;
  for(const rule of SIGNALS){
    if(rule.terms.includes(quote)) return {quote,axis:rule.axis,hook:rule.hook,body:rule.body(identity,quote),score:rule.score,kind:'signal'};
  }
  const numeric=numericMeta(quote);
  if(numeric) return {quote,axis:numeric.axis,hook:numeric.hook,body:numeric.body(identity),score:numeric.score,kind:'numeric'};
  return null;
}

function safeTitleFacts(itemName=''){
  const title=normalize(itemName);
  if(!title) return [];
  const out=[];
  const push=quote=>{
    const q=normalize(quote);
    if(q&&!out.some(x=>x.quote.toLowerCase()===q.toLowerCase())) out.push({quote:q,source:'itemName'});
  };
  for(const rule of SIGNALS){
    for(const term of rule.terms){
      const at=title.toLocaleLowerCase('ja-JP').indexOf(term.toLocaleLowerCase('ja-JP'));
      if(at<0) continue;
      const before=title.slice(Math.max(0,at-5),at);
      const after=title.slice(at+term.length,at+term.length+10);
      if(/(?:非|不|未)\s*$/.test(before)||/^(?:\s*(?:ではない|ではありません|非対応|不要|なし|無し|別売|を除く|対象外))/.test(after)) continue;
      push(title.slice(at,at+term.length));
      break;
    }
  }
  const patterns=[
    /最大\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)/gi,
    /\d+(?:\.\d+)?\s*(?:mm|cm|m)[×xX]\d+(?:\.\d+)?\s*(?:mm|cm|m)(?:[×xX]\d+(?:\.\d+)?\s*(?:mm|cm|m))?/gi,
    /\d+(?:\.\d+)?\s*(?:mAh|Ah|Wh|W|V|A|mm|cm|kg|mg|g|ml|mL|L|GB|インチ)/gi,
    /\d+(?:枚|個|本|袋|組|点|粒|錠|箱|足)(?:入り|入|セット|組)?/g
  ];
  for(const re of patterns){
    let match;
    while((match=re.exec(title))){
      const q=normalize(match[0]);
      const start=match.index,end=start+match[0].length;
      const before=title.slice(Math.max(0,start-1),start);
      const after=title.slice(end,end+1);
      if(/[0-9０-９A-Za-z.,，_+×xX-]$/.test(before)||/^[0-9０-９A-Za-z×xX]/.test(after)) continue;
      if(/^[ぁ-んァ-ヶ一-龯]/.test(after)) continue;
      if(numericMeta(q)) push(q);
    }
  }
  return out;
}

function corroboratingCandidate(best,candidates=[]){
  if(!best) return null;
  const family=axisFamily(best);
  if(family!=='adjustability') return null;
  const others=(Array.isArray(candidates)?candidates:[]).filter(c=>c&&c!==best&&axisFamily(c)===family&&normalize(c.quote)!==normalize(best.quote));
  if(!others.length) return null;
  // Pair only explicit variable structure/adjustment with an explicit range. This adds
  // no outcome or use-case claim; it simply joins two source facts from the same axis.
  if(best.axis==='可変範囲') return others.find(c=>['可変構造','高さ調整','角度調整'].includes(c.axis))||null;
  if(['可変構造','高さ調整','角度調整'].includes(best.axis)) return others.find(c=>c.axis==='可変範囲')||null;
  return null;
}

function groundedBody(best,candidates,id){
  const support=corroboratingCandidate(best,candidates);
  if(!support) return {body:best.body,supportQuote:''};
  const structural=best.axis==='可変範囲'?support:best;
  const range=best.axis==='可変範囲'?best:support;
  return {
    body:`${structural.quote}で、${range.quote}表記の${id}です。`,
    supportQuote:range.quote===best.quote?structural.quote:range.quote
  };
}

function composeGenericLocalCopy({identity='',facts=[],itemPrice=0,itemName=''}={}){
  const id=normalize(identity);
  if(!id||!Array.isArray(facts)||!facts.length) return null;
  const candidates=facts.map(f=>candidateFromFact(f,id)).filter(Boolean);
  const source=normalize(itemName)||facts.map(f=>normalize(f?.quote)).filter(Boolean).join(' ');
  const best=selectBestCandidate(candidates,{source,identity:id});
  if(!best||!shouldPublish(best)) return null;
  if(best.quote==='日本製'&&candidates.length===1) return null;
  const grounded=groundedBody(best,candidates,id);
  const rows=[best.hook+'。',grounded.body];
  if(Number(itemPrice)>0) rows.push('',`価格：${Number(itemPrice).toLocaleString('ja-JP')}円`);
  rows.push('',DISCLOSURE);
  return {
    text:rows.join('\n'),hook:best.hook,hookType:'scene',quote:best.quote,supportQuote:grounded.supportQuote,
    axis:best.axis,kind:best.kind,decision:best.decision,
    reasoningVersion:'2026-10-04-purchase-reason-operators-v2'
  };
}

function composeGenericFromTitle({itemName='',identity='',itemPrice=0}={}){
  const facts=safeTitleFacts(itemName);
  return composeGenericLocalCopy({identity,facts,itemPrice,itemName});
}

module.exports={normalize,numericMeta,candidateFromFact,safeTitleFacts,corroboratingCandidate,groundedBody,composeGenericLocalCopy,composeGenericFromTitle};
