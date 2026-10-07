'use strict';

const {selectBestCandidate,shouldPublish,axisFamily}=require('./partner-decision-kernel');
const {preprocessCaption}=require('./room-ai');
const {PROMO_RE}=require('../public/fact-safety');

const DISCLOSURE='※アフィリエイト広告を利用しています';

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function identityContainsFeature(identity='',quote=''){
  const id=normalize(identity).toLocaleLowerCase('ja-JP');
  const q=normalize(quote).toLocaleLowerCase('ja-JP');
  if(!id||!q) return false;
  if(id.includes(q)) return true;
  const variants={
    '折りたたみ':['折り畳み'],
    '折り畳み':['折りたたみ'],
    '伸縮式':['伸縮'],
    '伸縮':['伸縮式']
  };
  return (variants[q]||[]).some(v=>id.includes(v));
}

function foldBody(identity='',quote=''){
  const id=normalize(identity),q=normalize(quote);
  if(identityContainsFeature(id,q)) return `${id}です。`;
  return `${q}できる${id}です。`;
}

function extendBody(identity='',quote=''){
  const id=normalize(identity),q=normalize(quote);
  if(identityContainsFeature(id,q)) return `${id}です。`;
  if(q==='伸縮式') return `伸縮式の${id}です。`;
  return `伸縮タイプの${id}です。`;
}

function materialBody(identity='',quote=''){
  const id=normalize(identity),q=normalize(quote);
  if(q==='木製') return `木製の${id}です。`;
  if(['ステンレス','スチール','シリコン','アルミ','アルミニウム','ガラス','セラミック'].includes(q)) return `${q}製の${id}です。`;
  if(['本革','レザー'].includes(q)) return `${q}を使った${id}です。`;
  if(['メッシュ','ナイロン','ポリエステル','コットン','綿'].includes(q)) return `${q}素材の${id}です。`;
  return `${q}を使った${id}です。`;
}

const SIGNALS=[
  {terms:['型崩れ防止','形崩れ防止'],axis:'保護構造',hook:'形を守るための仕様まで見て選ぶなら',body:(id,q)=>`「${q}」表記の${id}です。`,score:12},
  {terms:['絡まり防止','色移り防止','毛玉防止','シワ防止'],axis:'保護構造',hook:'衣類を守るための仕様まで見て選ぶなら',body:(id,q)=>`「${q}」表記の${id}です。`,score:11},
  {terms:['ドラム式対応','乾燥機対応','全自動対応','二槽式対応'],axis:'対応機種',hook:'対応する洗濯機まで見て選ぶなら',body:(id,q)=>`「${q}」表記の${id}です。`,score:11},
  {terms:['ファスナーカバー付き','ファスナー収納付き','全開ファスナー','ロングファスナー','取っ手付き','持ち手付き','二重構造'],axis:'設置・構造',hook:'構造まで見て選ぶなら',body:(id,q)=>`${q}の${id}です。`,score:10},
  {terms:['伸縮式','伸縮'],axis:'可変構造',hook:'長さを変えて使いたいなら',body:(id,q)=>extendBody(id,q),score:11},
  {terms:['高さ調整','高さ調節'],axis:'高さ調整',hook:'高さを変えて使いたいなら',body:(id,q)=>`${q}に対応した${id}です。`,score:11},
  {terms:['角度調整','角度調節'],axis:'角度調整',hook:'角度を変えて使いたいなら',body:(id,q)=>`${q}に対応した${id}です。`,score:11},
  {terms:['片手でカット','片手で切れる'],axis:'操作方法',hook:'操作方法まで見て選ぶなら',body:(id,q)=>`「${q}」表記の${id}です。`,score:10},
  {terms:['リモコン付き','リモコン付'],axis:'操作方法',hook:'操作方法まで見て選ぶなら',body:(id,q)=>`${q}の${id}です。`,score:10},
  {terms:['三脚一体型','三脚付き'],axis:'設置・構造',hook:'置き方や設置方法まで見て選ぶなら',body:(id,q)=>`${q}の${id}です。`,score:10},
  {terms:['折りたたみ','折り畳み'],axis:'収納形態',hook:'折りたためる形で選びたいなら',body:(id,q)=>foldBody(id,q),score:10},
  {terms:['食洗機対応'],axis:'お手入れ',hook:'食洗機対応で選びたいなら',body:(id,q)=>`${q}の${id}です。`,score:10},
  {terms:['洗える'],axis:'お手入れ',hook:'洗えるタイプで選びたいなら',body:(id,q)=>`${q}${id}です。`,score:10},
  {terms:['充電式'],axis:'電源方式',hook:'電源方式まで見て選ぶなら',body:(id)=>`充電式の${id}で、コードをつながずに使うタイプです。`,score:9},
  {terms:['USB-C対応','USB-C','Type-C対応','Type-C'],axis:'端子',hook:'接続端子まで見て選ぶなら',body:(id,q)=>`${q}表記の${id}です。`,score:9},
  {terms:['Bluetooth対応','Bluetooth'],axis:'接続方式',hook:'接続方式まで見て選ぶなら',body:(id,q)=>`${q}表記の${id}です。`,score:9},
  {terms:['防水','撥水'],axis:'仕様',hook:'使う環境に関わる仕様まで見て選ぶなら',body:(id,q)=>`${q}仕様の${id}です。`,score:8},
  {terms:['メッシュ','ステンレス','スチール','シリコン','アルミ','アルミニウム','木製','ガラス','セラミック','本革','レザー','ナイロン','ポリエステル','コットン','綿'],axis:'素材・構造',hook:'素材まで見て選ぶなら',body:(id,q)=>materialBody(id,q),score:7},
  {terms:['キャスター付き','マグネット式','壁掛け','粘着式'],axis:'設置・構造',hook:'設置方法まで見て選ぶなら',body:(id,q)=>`${q}の${id}です。`,score:7},
  {terms:['日本製'],axis:'生産情報',hook:'生産情報まで見て選ぶなら',body:(id,q)=>`${q}の${id}です。`,score:3}
];

function labeledMeta(quote=''){
  const q=normalize(quote);
  if(/^(?:容量|内容量)\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:ml|mL|L)$/i.test(q)){
    return {axis:'容量',hook:'容量まで見て選ぶなら',body:(id)=>`${q}表記の${id}です。`,score:9,kind:'signal'};
  }
  if(/^(?:高さ|幅|奥行|奥行き|長さ|直径)\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)$/i.test(q)){
    return {axis:'サイズ',hook:'サイズまで見て選ぶなら',body:(id)=>`${q}表記の${id}です。`,score:9,kind:'signal'};
  }
  if(/^(?:重量|質量|重さ)\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:mg|g|kg)$/i.test(q)){
    return {axis:'重量',hook:'重さまで見て選ぶなら',body:(id)=>`${q}表記の${id}です。`,score:8,kind:'signal'};
  }
  return null;
}

function numericMeta(quote=''){
  const q=normalize(quote);
  if(/^最大\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)$/i.test(q)) return {axis:'可変範囲',hook:'長さの上限まで見て選ぶなら',body:(id)=>`${q}表記の${id}です。`,score:8};
  if(/^\d+(?:\.\d+)?\s*(?:mm|cm|m)(?:[×xX]\d+(?:\.\d+)?\s*(?:mm|cm|m)){1,2}$/i.test(q)) return {axis:'サイズ',hook:'サイズまで見て選ぶなら',body:(id)=>`${q}表記の${id}です。`,score:7};
  if(/^\d+(?:枚|個|本|袋|組|点|粒|錠|箱|足)(?:入り|入|セット|組)?$/.test(q)) return {axis:'入り数',hook:'入り数まで見て選ぶなら',body:(id)=>`${q}の${id}です。`,score:6};
  if(/^\d+(?:\.\d+)?\s*(?:mAh|Ah|Wh|W|V|A|mm|cm|m|kg|mg|g|ml|mL|L|GB|インチ)$/i.test(q)) return {axis:'数値仕様',hook:'数値仕様まで見て選ぶなら',body:(id)=>`${q}表記の${id}です。`,score:4};
  return null;
}

function canonicalSignal(value=''){
  return normalize(value).replace(/\s+/g,'').toLocaleLowerCase('ja-JP');
}

function candidateFromFact(fact,identity){
  const quote=normalize(fact?.quote);
  if(!quote) return null;
  const canonical=canonicalSignal(quote);
  for(const rule of SIGNALS){
    if(rule.terms.some(term=>canonicalSignal(term)===canonical)) return {quote,source:fact?.source||'itemName',axis:rule.axis,hook:rule.hook,body:rule.body(identity,quote),score:rule.score,kind:'signal'};
  }
  const labeled=labeledMeta(quote);
  if(labeled) return {quote,source:fact?.source||'itemName',axis:labeled.axis,hook:labeled.hook,body:labeled.body(identity),score:labeled.score,kind:labeled.kind};
  const numeric=numericMeta(quote);
  if(numeric) return {quote,source:fact?.source||'itemName',axis:numeric.axis,hook:numeric.hook,body:numeric.body(identity),score:numeric.score,kind:'numeric'};
  return null;
}

function regexEscape(value=''){
  return String(value).replace(/[.*+?^$(){}|[\]\\]/g,'\\$&');
}

function safeTitleFacts(itemName=''){
  const title=normalize(itemName);
  if(!title) return [];
  const out=[];
  const push=quote=>{const q=normalize(quote);if(q&&!out.some(x=>x.quote.toLowerCase()===q.toLowerCase())) out.push({quote:q,source:'itemName'});};
  for(const rule of SIGNALS){
    for(const term of rule.terms){
      const escaped=[...term].map(regexEscape).join('\\s*');
      const match=new RegExp(escaped,'i').exec(title);
      if(!match) continue;
      const at=match.index;
      const matched=match[0];
      const before=title.slice(Math.max(0,at-5),at);
      const after=title.slice(at+matched.length,at+matched.length+10);
      if(/(?:非|不|未)\s*$/.test(before)||/^(?:\s*(?:ではない|ではありません|非対応|不要|なし|無し|別売|を除く|対象外))/.test(after)) continue;
      if(term==='充電式'&&/^\s*(?:バッテリー|電池|ケース|カバー|ポーチ|アダプター|ケーブル|充電器|交換|替え)/.test(after)) continue;
      push(matched);
      break;
    }
  }
  const labeledPatterns=[
    /(?:容量|内容量)\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:ml|mL|L)/gi,
    /(?:高さ|幅|奥行|奥行き|長さ|直径)\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)/gi,
    /(?:重量|質量|重さ)\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:mg|g|kg)/gi
  ];
  for(const re of labeledPatterns){
    let match;
    while((match=re.exec(title))){
      const q=normalize(match[0]);
      if(labeledMeta(q)) push(q);
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
      const before=title.slice(Math.max(0,start-1),start),after=title.slice(end,end+1);
      if(/[0-9０-９A-Za-z.,，_+×xX-]$/.test(before)||/^[0-9０-９A-Za-z×xX]/.test(after)) continue;
      if(/^[ぁ-んァ-ヶ一-龯]/.test(after)) continue;
      push(q);
    }
  }
  return out;
}

const CAPTION_NOISE=/(?:メーカー希望小売価格|商品情報商品名|商品情報|商品名|内容量|商品説明\s*$|Q\s*[:：]|A\s*[:：]|偽サイト|運送便|お支払|返品|交換|店舗情報|ショップ案内|関連キーワード|こちらの商品|レビュー特典|クーポン|送料無料|ポイント\d*倍|P\d+倍|ランキング|受賞|シール集め|バインダー)/i;
const CAPTION_HIGH_RISK=/(?:改善|予防|安全|安心|無害|保証|発火しない|燃えにくい|難燃|抗菌|除菌|殺菌|消臭|防臭|アレルギー|疲労|痛み|快眠|安眠|健康|小顔|引き締め|リフトアップ|痩せ|若返|治療|治る|最強|最高|絶対|必ず)/i;
const NEGATED_CLAIM=/(?:非対応|対応不可|対象外|別売|付属しない|付属なし|できない|出来ない|ではない|ではありません)/;
const TITLE_ANCHOR_NOISE=/^(?:商品|用品|グッズ|便利|おすすめ|人気|送料無料|正規品|公式|限定|セール|sale|旅行|トラベル|家庭用|大型|大きい|小型|コンパクト|ブラック|ホワイト|メンズ|レディース|男女兼用|洗濯)$/i;

function titleAnchors(itemName='',identity=''){
  const id=normalize(identity).toLocaleLowerCase('ja-JP');
  return normalize(itemName)
    .split(/[\s【】〖〗（）()「」『』\[\]{}・／/\\|｜,:：;；!！?？★☆※。&＆]+/)
    .map(normalize)
    .filter(x=>x&&[...x].length>=2)
    .filter(x=>x.toLocaleLowerCase('ja-JP')!==id)
    .filter(x=>!TITLE_ANCHOR_NOISE.test(x)&&!PROMO_RE.test(x))
    .filter(x=>!/^[-+×xX0-9０-９.,，%％]+$/.test(x))
    .slice(0,24);
}

function captionSentences(itemCaption=''){
  const caption=preprocessCaption(itemCaption);
  if(!caption) return [];
  return (caption.match(/[^。！？!]+[。！？!]?/g)||[])
    .flatMap(x=>x.split(/[●■◆▼▶︎▶]/))
    .map(x=>normalize(x).replace(/^[・\-—–:：\s]+/,''))
    .filter(Boolean)
    .slice(0,30);
}

function captionAxis(sentence=''){
  const s=normalize(sentence);
  if(/(?:出し入れ|取り出し|開口|口が).*(?:しやす|開く|広い)|(?:ロング|全開)ファスナー/.test(s)) return {axis:'操作方法',hook:'出し入れのしやすさまで見て選ぶなら',score:13};
  if(/(?:シングル|ダブル|衣類|荷物|布団|毛布).*(?:入る|収納でき|包み込む)|(?:大容量|容量)/.test(s)) return {axis:'容量',hook:'入る量や容量まで見て選ぶなら',score:12};
  if(/(?:型|形)崩れ.*(?:防|抑|おさえ)|(?:擦れ|ねじれ|衝撃|傷み|傷|引っかかり|ほつれ).*(?:防|抑|おさえ|吸収)/.test(s)) return {axis:'保護構造',hook:'保護に関わる仕様まで見て選ぶなら',score:12};
  if(/(?:ドラム式|乾燥機|食洗機|IH|電子レンジ|全自動|二槽式).*(?:対応|OK)|(?:対応|OK).*(?:ドラム式|乾燥機|食洗機|IH|電子レンジ|全自動|二槽式)/i.test(s)) return {axis:'対応機種',hook:'対応する機種まで見て選ぶなら',score:11};
  if(/(?:持ち手|取っ手|ファスナー|メッシュ|二重構造|三重構造|カバー付き|収納付き)/.test(s)) return {axis:'設置・構造',hook:'構造まで見て選ぶなら',score:10};
  if(/(?:洗える|丸洗い|水洗い|食洗機対応)/.test(s)) return {axis:'お手入れ',hook:'お手入れ方法まで見て選ぶなら',score:9};
  if(/(?:サイズ|寸法|内径|外径|幅|高さ|奥行|直径).*\d|\d+(?:\.\d+)?\s*(?:mm|cm|m)\b/i.test(s)) return {axis:'サイズ',hook:'サイズまで見て選ぶなら',score:8};
  if(/(?:しやすい|しやすく|簡単|ワンタッチ)/.test(s)) return {axis:'操作方法',hook:'使い方に関わる仕様まで見て選ぶなら',score:8};
  return null;
}

function safeCaptionCandidates({itemName='',itemCaption='',identity=''}={}){
  const id=normalize(identity);
  const anchors=titleAnchors(itemName,id);
  const out=[];
  for(const sentence of captionSentences(itemCaption)){
    if(sentence.length<8||sentence.length>160) continue;
    if(/^\s*(?:\d+[.．)）]|Q\s*[:：]|A\s*[:：])/.test(sentence)) continue;
    if(PROMO_RE.test(sentence)||CAPTION_NOISE.test(sentence)||CAPTION_HIGH_RISK.test(sentence)||NEGATED_CLAIM.test(sentence)) continue;
    const groundedToProduct=sentence.includes(id)||anchors.some(a=>sentence.includes(a));
    if(!groundedToProduct) continue;
    const meta=captionAxis(sentence);
    if(!meta) continue;
    const body=sentence.includes(id)?sentence:(id+'は、'+sentence);
    out.push({quote:sentence,source:'itemCaption',axis:meta.axis,hook:meta.hook,body,score:meta.score,kind:'caption_claim',strongDirect:true});
  }
  return out.filter((x,i,a)=>a.findIndex(y=>y.quote===x.quote)===i).slice(0,8);
}
function meaningBundle(best,candidates=[]){
  if(!best) return null;
  const family=axisFamily(best);
  const supportQuotes=[...new Set((Array.isArray(candidates)?candidates:[]).filter(c=>c&&axisFamily(c)===family).map(c=>normalize(c.quote)).filter(Boolean))];
  return {family,primaryQuote:normalize(best.quote),supportQuotes,evidenceCount:supportQuotes.length,integrated:supportQuotes.length>1};
}

function buildFamilyHypotheses(candidates=[],context={}){
  const groups=new Map();
  for(const candidate of Array.isArray(candidates)?candidates:[]){
    if(!candidate) continue;
    const family=axisFamily(candidate);
    if(!groups.has(family)) groups.set(family,[]);
    groups.get(family).push(candidate);
  }
  const rows=[];
  for(const [family,group] of groups.entries()){
    const winner=selectBestCandidate(group,context);
    if(!winner||!winner.decision) continue;
    rows.push({
      family,
      quote:normalize(winner.quote),
      axis:normalize(winner.axis),
      score:Number(winner.decision.totalScore??winner.decision.score??0),
      confidence:winner.decision.confidence,
      purchaseImpact:Number(winner.decision.purchaseImpactBonus||0),
      supportCount:group.length,
      supportQuotes:[...new Set(group.map(x=>normalize(x.quote)).filter(Boolean))],
      decisionAxisMatched:Boolean(winner.decision?.persuasionComponents?.decisionAxis)
    });
  }
  rows.sort((a,b)=>b.score-a.score||b.purchaseImpact-a.purchaseImpact||b.supportCount-a.supportCount||a.family.localeCompare(b.family,'ja'));
  return rows;
}

function resolveCompetingHypotheses(candidates=[],context={}){
  const rows=buildFamilyHypotheses(candidates,context);
  if(!rows.length) return {status:'none',winner:null,runnerUp:null,margin:null,hypotheses:[]};
  const winner=rows[0],runnerUp=rows[1]||null;
  if(!runnerUp) return {status:'clear',winner,runnerUp:null,margin:null,hypotheses:rows};
  const margin=winner.score-runnerUp.score;
  const strongerEvidence=winner.supportCount>runnerUp.supportCount;
  const decisionAxisLead=winner.decisionAxisMatched&&!runnerUp.decisionAxisMatched;
  const impactLead=margin>=1&&winner.purchaseImpact>runnerUp.purchaseImpact;
  const status=(margin>=2||strongerEvidence||decisionAxisLead||impactLead)?'clear':'close';
  return {status,winner,runnerUp,margin,hypotheses:rows};
}

function semanticProfile(candidates=[],context={}){
  const hypotheses=buildFamilyHypotheses(candidates,context);
  if(!hypotheses.length) return {status:'none',dominantFamily:'',secondaryFamilies:[],evidenceCount:0,breadth:0};
  const dominant=hypotheses[0];
  const runnerUp=hypotheses[1]||null;
  const resolution=resolveCompetingHypotheses(candidates,context);
  return {
    status:resolution.status,
    dominantFamily:dominant.family,
    dominantAxis:dominant.axis,
    dominantQuote:dominant.quote,
    secondaryFamilies:hypotheses.slice(1,4).map(x=>x.family),
    evidenceCount:hypotheses.reduce((sum,x)=>sum+x.supportCount,0),
    breadth:hypotheses.length,
    margin:runnerUp?dominant.score-runnerUp.score:null,
    hypotheses
  };
}

function corroboratingCandidate(best,candidates=[]){
  if(!best) return null;
  const family=axisFamily(best);
  if(family!=='adjustability') return null;
  const others=(Array.isArray(candidates)?candidates:[]).filter(c=>c&&c!==best&&axisFamily(c)===family&&normalize(c.quote)!==normalize(best.quote));
  if(!others.length) return null;
  if(best.axis==='可変範囲') return others.find(c=>['可変構造','高さ調整','角度調整'].includes(c.axis))||null;
  if(['可変構造','高さ調整','角度調整'].includes(best.axis)) return others.find(c=>c.axis==='可変範囲')||null;
  return null;
}

function groundedBody(best,candidates,id){
  const support=corroboratingCandidate(best,candidates);
  if(!support) return {body:best.body,supportQuote:''};
  const structural=best.axis==='可変範囲'?support:best;
  const range=best.axis==='可変範囲'?best:support;
  return {body:`${structural.quote}で、${range.quote}表記の${id}です。`,supportQuote:range.quote===best.quote?structural.quote:range.quote};
}

function composeGenericLocalCopy({identity='',facts=[],itemPrice=0,itemName='',itemCaption='',extraCandidates=[]}={}){
  const id=normalize(identity);
  const sourceFacts=Array.isArray(facts)?facts:[];
  const directCandidates=Array.isArray(extraCandidates)?extraCandidates.filter(Boolean):[];
  if(!id||(!sourceFacts.length&&!directCandidates.length)) return null;
  const candidates=[...sourceFacts.map(f=>candidateFromFact(f,id)).filter(Boolean),...directCandidates];
  const source=[normalize(itemName),preprocessCaption(itemCaption)].filter(Boolean).join(' ')||sourceFacts.map(f=>normalize(f?.quote)).filter(Boolean).join(' ');
  const context={source,identity:id};
  const best=selectBestCandidate(candidates,context);
  if(!best||!shouldPublish(best)) return null;
  const family=axisFamily(best);
  const families=new Set(candidates.map(axisFamily));
  const weakStandalone=!best.strongDirect&&(
    family==='material'
    || (family==='maintenance'&&normalize(best.quote)==='洗える')
    || normalize(best.axis)==='入り数'
    || (family==='capacity'&&best.kind==='numeric'&&!/^(?:容量|内容量|高さ|幅|奥行|奥行き|長さ|直径|重量|質量|重さ)\s*[:：]?/.test(normalize(best.quote)))
  );
  if(weakStandalone) return null;
  const hypothesis=resolveCompetingHypotheses(candidates,context);
  if(hypothesis.status==='close') return null;
  if(best.quote==='日本製'&&candidates.length===1) return null;
  const grounded=groundedBody(best,candidates,id),bundle=meaningBundle(best,candidates),profile=semanticProfile(candidates,context);
  const rows=[best.hook+'。',grounded.body];
  if(Number(itemPrice)>0) rows.push('',`価格：${Number(itemPrice).toLocaleString('ja-JP')}円`);
  rows.push('',DISCLOSURE);
  return {
    text:rows.join('\n'),hook:best.hook,hookType:'scene',quote:best.quote,source:best.source||'itemName',supportQuote:grounded.supportQuote,
    axis:best.axis,kind:best.kind,
    decision:{...best.decision,meaningBundle:bundle,semanticProfile:profile,hypothesisStatus:hypothesis.status,hypothesisMargin:hypothesis.margin,hypotheses:hypothesis.hypotheses},
    reasoningVersion:'2026-10-04-purchase-reason-operators-v5'
  };
}

function composeGenericFromTitle({itemName='',identity='',itemPrice=0}={}){
  const facts=safeTitleFacts(itemName);
  return composeGenericLocalCopy({identity,facts,itemPrice,itemName});
}

function composeGenericFromSources({itemName='',itemCaption='',identity='',itemPrice=0}={}){
  const facts=safeTitleFacts(itemName);
  const extraCandidates=safeCaptionCandidates({itemName,itemCaption,identity});
  return composeGenericLocalCopy({identity,facts,itemPrice,itemName,itemCaption,extraCandidates});
}

module.exports={
  normalize,identityContainsFeature,foldBody,extendBody,materialBody,labeledMeta,numericMeta,canonicalSignal,candidateFromFact,safeTitleFacts,
  titleAnchors,captionSentences,captionAxis,safeCaptionCandidates,
  meaningBundle,buildFamilyHypotheses,resolveCompetingHypotheses,semanticProfile,corroboratingCandidate,groundedBody,
  composeGenericLocalCopy,composeGenericFromTitle,composeGenericFromSources
};