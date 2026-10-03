'use strict';
const normalize=x=>String(x??'').normalize('NFKC').replace(/[‐‑‒–—−]/g,'-').replace(/\s+/g,' ').trim();
function sources(item){return [{source:'name',text:normalize(item.itemName)},{source:'caption',text:normalize(item.itemCaption)}];}
function comparisonView(value){const text=normalize(value),positions=[];let key='';for(let i=0;i<text.length;i++){if(text[i]===' '&&!(/[A-Za-z0-9]/.test(text[i-1]||'')&&/[A-Za-z0-9]/.test(text[i+1]||'')))continue;key+=text[i];positions.push(i);}return {key,positions};}
function bind(item,quote){const q=normalize(quote);if(!q)return null;for(const s of sources(item)){let start=s.text.indexOf(q),end=start+q.length;if(start<0){const src=comparisonView(s.text),needle=comparisonView(q).key,at=src.key.indexOf(needle);if(!needle||at<0)continue;start=src.positions[at];end=src.positions[at+needle.length-1]+1;}return {quote:s.text.slice(start,end),source:s.source,start,end};}return null;}
const forbidden=/ランキング|受賞|楽天.*1位|送料無料|クーポン|半額|最安|SALE|安全|安心|無害|保証|最強|最高|絶対|必ず|治療|治る|予防|若返|美白|小顔|リフトアップ|痩せる/i;
const resultTerms=[['疲れにく','疲れにく'],['疲れない','疲れない'],['清潔に保','清潔に保'],['持ち運びやす','持ち運びやす'],['楽々','楽々'],['省スペース','省スペース'],['快適','快適'],['除菌','除菌'],['殺菌','殺菌'],['消臭','消臭'],['防臭','防臭'],['抗菌','抗菌']];
function numbers(text){return normalize(text).match(/\d+(?:\.\d+)?/g)||[];}
function measures(text){
 const s=normalize(text).replace(/\s+/g,'');
 const found=[...s.matchAll(/(\d+(?:\.\d+)?)(mAh|kWh|Wh|MHz|kHz|Hz|mm|cm|km|mg|kg|ml|mL|°C|℃|時間|秒|分|度|個|本|枚|足|円|%|W|V|A|g|m|L)(?![A-Za-z])/g)].map(m=>m[1]+m[2].replace('mL','ml').replace('℃','°C'));
 // Dimension tables place the unit before the value, or once after a chain.
 // Expand only explicit length dimensions; unrelated numbers never inherit it.
 for(const m of s.matchAll(/(?:外寸|内寸)?[（(]?(?:幅|奥行き?|奥|高さ?|深さ?|長さ|厚さ)[）)]?\[(mm|cm|m)\][:：]?(\d+(?:\.\d+)?)/g))found.push(m[2]+m[1]);
 for(const m of s.matchAll(/((?:(?:幅|奥行き?|奥|高さ?|深さ?|長さ|厚さ)?\d+(?:\.\d+)?[×xX・])+(?:幅|奥行き?|奥|高さ?|深さ?|長さ|厚さ)?\d+(?:\.\d+)?)(mm|cm|m)(?![A-Za-z])/g))for(const n of numbers(m[1]))found.push(n+m[2]);
 return found;
}
function inspect(item,draft){
 const failures=[],flags=[],bindings=[];const add=(rule,sentence,detail='')=>failures.push({rule,sentence,detail});
 if(!draft?.product?.what||!draft.product.acts_on||!bind(item,draft.product.acts_on_quote))add('product_evidence',null,'商品種別と作用対象を記載し、acts_on_quoteは用途を支える原文の連続部分をコピーする。言い換えや記号の変更はしない。');
 const ss=Array.isArray(draft?.sentences)?draft.sentences:[];
 if(ss.length<1||ss.length>4)add('incomplete_post',null,'商品・選ぶ理由・場面が成立する投稿が必要。文の数を増やすために別の特徴を足さない。');
 if(new Set(ss.map(s=>normalize(s.text))).size!==ss.length)add('duplicate_sentences',null);
 ss.forEach((s,i)=>{
  const text=normalize(s?.text),quotes=Array.isArray(s?.quotes)?s.quotes:[],proof=quotes.map(q=>bind(item,q));bindings[i]=proof.filter(Boolean);
  if(!text||!/[ぁ-んァ-ヶ一-龠]/.test(text))add('invalid_sentence',i);
  if(quotes.some((q,j)=>!proof[j]))add('quote_not_in_source',i,'引用が原文と一致しない。quotesは言い換えず、記号・助詞も含めた連続部分をそのままコピーする。不一致引用: '+quotes.filter((q,j)=>!proof[j]).join(' | '));
  const evidence=proof.filter(Boolean).map(p=>p.quote).join(' ');
  const prohibited=text.match(forbidden);if(prohibited)add('prohibited_expression',i,'禁止表現「'+prohibited[0]+'」を使わない。安全・安心・結果の保証ではなく、原文にある機能と、それを選びたい用途で全文を書き直す。');
  if(numbers(text).some(n=>!numbers(evidence).includes(n)))add('number_without_evidence',i,'文中のすべての数値を支える原文引用を付ける。商品名の人数なども使うなら商品名の該当部分を引用する。');
  if(measures(text).some(n=>!measures(evidence).includes(n)))add('measurement_without_evidence',i,'数値と単位の組を引用で裏付ける。寸法表の単位は省略・共通表記を読み取れるが、原文と違う単位や数値には変えない。');
  for(const [term,support] of resultTerms)if(text.includes(term)&&!evidence.includes(support))add('unsupported_result',i,term);
  for(const guarantee of text.match(/一日中|ずっと|全く|まったく|ニオイ(?:が|を)?気にならない|臭わない|疲れない/g)||[])if(!evidence.includes(guarantee))add('unsupported_guarantee',i,guarantee);
  if(/(?:を|が)(?:防ぐ|防ぎ|防げ)/.test(text)&&!/(?:防ぐ|防ぎ|防げ|防止)/.test(evidence))add('unsupported_prevention_result',i,'「防○」という仕様名や「入りにくい」「強い」を、問題を防ぐ結果の断定へ変えない。原文の程度を保つか、その機能を選びたい意図として書く。');
  const immediate=/(?:すぐ|瞬時|一瞬)(?:に|で)?[^。！？、]{0,16}(完了|終わ|使え|済む|済ま|沸|乾)/g;
  const immediates=value=>[...value.matchAll(immediate)].map(m=>/完了|終わ|済む|済ま/.test(m[1])?'completion':m[1]);
  if(immediates(text).some(action=>!immediates(evidence).includes(action)))add('unsupported_immediate_result',i,'「スムーズ」「急速」「約○時間」は、すぐ完了・瞬時に使える根拠ではない。別の動作の速さを転用せず、原文にある時間や機能を伝える。');
  if(/(?:カバー|付属品|別売|のみ|だけ|除く|非対応|未対応)/.test(evidence))flags.push({sentence:i,rule:'scope_or_exclusion',quotes:bindings[i]});
  if(/カバー/.test(evidence)&&!/(?:本体|全体|まるごと)/.test(evidence)&&/(?:本体|全体|まるごと|丸ごと)(?:を|が|も|は)/.test(text))add('part_expanded_to_whole',i);
  if(proof.some(p=>p&&/(?:非|未|不)$/.test(sources(item).find(x=>x.source===p.source).text.slice(Math.max(0,p.start-3),p.start).trimEnd())))add('quote_cuts_negation',i);
 });
 const full=ss.map(s=>normalize(s.text)).join(' ');
 if(!/したい|とき|時に|なら|方に|人に|前に|後に/.test(full))flags.push({rule:'scene_needs_review'});
 if(/運転|バイク|ライディング|車両/.test(normalize(draft?.product?.what)+' '+normalize(draft?.product?.acts_on))&&/スマホ|ナビ|端末/.test(full)&&(!/停車中|停車して|停車した(?:とき|際|状態)/.test(full)||/走行中|運転中/.test(full)))add('unsafe_operation',null,'運転に関係する製品のスマホ・ナビ操作は、操作する文の中に停車中と明記する。走行中・運転中の操作は禁止。');
 return {ok:failures.length===0,failures,flags,bindings};
}
const questions=['target','part','conditions','negation','degree'];
function assessReview(item,draft,raw){
 const failures=[],evidence=[];const ss=draft.sentences||[],rows=raw?.sentences||[];
 const root=raw?.product;
 if(root?.what!=='supported'||root?.acts_on!=='supported')failures.push({rule:'product_not_supported',sentence:null});
 if(rows.length!==ss.length)failures.push({rule:'incomplete_review',sentence:null});
 ss.forEach((s,i)=>{
  const matches=rows.filter(r=>normalize(r.text)===normalize(s.text));
  if(matches.length!==1){failures.push({rule:'missing_or_duplicate_review',sentence:i});return;}
  const r=matches[0];for(const q of questions)if(r[q]!=='supported')failures.push({rule:q+'_'+(r[q]||'missing'),sentence:i,detail:r.reason||''});
  const proof=(r.evidenceQuotes||[]).map(q=>bind(item,q));
  if(!proof.length||proof.some(p=>!p))failures.push({rule:'review_evidence_not_in_source',sentence:i});
  evidence[i]=proof.filter(Boolean).map(p=>({...p,approvalEvidence:(s.quotes||[]).some(q=>comparisonView(q).key.includes(comparisonView(p.quote).key))?'generated':'added_by_review'}));
 });
 for(const q of ['identity','reason','scene','natural','non_redundant','room_style'])if(raw?.quality?.[q]!=='supported')failures.push({rule:'quality_'+q+'_'+(raw?.quality?.[q]||'missing'),sentence:null});
 return {ok:failures.length===0,failures,evidence,additionalEvidence:evidence.flat().filter(p=>p.approvalEvidence==='added_by_review')};
}
function publication(item,draft,review){const machine=inspect(item,draft);const ai=assessReview(item,draft,review);const failures=[...machine.failures,...ai.failures];return {status:failures.length?'blocked':'ready',reasons:failures,text:failures.length?'':draft.sentences.map(s=>normalize(s.text)).join('\n\n')+'\n\n※アフィリエイト広告を利用しています',ledger:ai.evidence,additionalEvidence:ai.additionalEvidence,machine,review:ai};}
module.exports={normalize,bind,inspect,assessReview,publication,questions};
