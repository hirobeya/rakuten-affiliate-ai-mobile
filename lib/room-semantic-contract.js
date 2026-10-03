'use strict';
const normalize=x=>String(x??'').normalize('NFKC').replace(/[‐‑‒–—−]/g,'-').replace(/\s+/g,' ').trim();
function sources(item){return [{source:'name',text:normalize(item.itemName)},{source:'caption',text:normalize(item.itemCaption)}];}
function bind(item,quote){const q=normalize(quote);if(!q)return null;for(const s of sources(item)){const start=s.text.indexOf(q);if(start>=0)return {quote:q,source:s.source,start,end:start+q.length};}return null;}
const forbidden=/ランキング|受賞|楽天.*1位|送料無料|クーポン|半額|最安|SALE|安全|安心|無害|保証|最強|最高|絶対|必ず|治療|治る|予防|若返|美白|小顔|リフトアップ|痩せる/i;
const resultTerms=[['疲れにく','疲れにく'],['疲れない','疲れない'],['清潔に保','清潔に保'],['持ち運びやす','持ち運びやす'],['楽々','楽々'],['省スペース','省スペース'],['快適','快適'],['除菌','除菌'],['殺菌','殺菌'],['消臭','消臭'],['防臭','防臭'],['抗菌','抗菌']];
function numbers(text){return normalize(text).match(/\d+(?:\.\d+)?/g)||[];}
function measures(text){return [...normalize(text).replace(/\s+/g,'').matchAll(/(\d+(?:\.\d+)?)(mAh|kWh|Wh|MHz|kHz|Hz|mm|cm|km|mg|kg|ml|mL|°C|℃|時間|秒|分|度|個|本|枚|足|円|%|W|V|A|g|m|L)(?![A-Za-z])/g)].map(m=>m[1]+m[2].replace('mL','ml').replace('℃','°C'));}
function inspect(item,draft){
 const failures=[],flags=[],bindings=[];const add=(rule,sentence,detail='')=>failures.push({rule,sentence,detail});
 if(!draft?.product?.what||!draft.product.acts_on||!bind(item,draft.product.acts_on_quote))add('product_evidence',null);
 const ss=Array.isArray(draft?.sentences)?draft.sentences:[];
 if(ss.length<2||ss.length>4)add('incomplete_post',null);
 if(new Set(ss.map(s=>normalize(s.text))).size!==ss.length)add('duplicate_sentences',null);
 ss.forEach((s,i)=>{
  const text=normalize(s?.text),quotes=Array.isArray(s?.quotes)?s.quotes:[],proof=quotes.map(q=>bind(item,q));bindings[i]=proof.filter(Boolean);
  if(!text||!/[ぁ-んァ-ヶ一-龠]/.test(text))add('invalid_sentence',i);
  if(quotes.some((q,j)=>!proof[j]))add('quote_not_in_source',i,quotes.filter((q,j)=>!proof[j]).join(' | '));
  const evidence=proof.filter(Boolean).map(p=>p.quote).join(' ');
  if(forbidden.test(text))add('prohibited_expression',i);
  if(numbers(text).some(n=>!numbers(evidence).includes(n)))add('number_without_evidence',i);
  if(measures(text).some(n=>!measures(evidence).includes(n)))add('measurement_without_evidence',i);
  for(const [term,support] of resultTerms)if(text.includes(term)&&!evidence.includes(support))add('unsupported_result',i,term);
  for(const guarantee of text.match(/一日中|ずっと|全く|まったく|ニオイ(?:が|を)?気にならない|臭わない|疲れない/g)||[])if(!evidence.includes(guarantee))add('unsupported_guarantee',i,guarantee);
  if(/(?:カバー|付属品|別売|のみ|だけ|除く|非対応|未対応)/.test(evidence))flags.push({sentence:i,rule:'scope_or_exclusion',quotes:bindings[i]});
  if(/カバー/.test(evidence)&&!/(?:本体|全体|まるごと)/.test(evidence)&&/(?:本体|全体|まるごと|丸ごと)(?:を|が|も|は)/.test(text))add('part_expanded_to_whole',i);
  if(proof.some(p=>p&&/(?:非|未|不)$/.test(sources(item).find(x=>x.source===p.source).text.slice(Math.max(0,p.start-2),p.start))))add('quote_cuts_negation',i);
 });
 const full=ss.map(s=>normalize(s.text)).join(' ');
 if(!/したい|とき|時に|なら|方に|人に|前に|後に/.test(full))flags.push({rule:'scene_needs_review'});
 if(/運転|バイク|ライディング|車両/.test(normalize(draft?.product?.what)+' '+normalize(draft?.product?.acts_on))&&/スマホ|ナビ|端末/.test(full)&&(!/停車中|停車して|停車した(?:とき|際|状態)/.test(full)||/走行中|運転中/.test(full)))add('unsafe_operation',null);
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
  evidence[i]=proof.filter(Boolean).map(p=>({...p,approvalEvidence:(s.quotes||[]).some(q=>normalize(q).includes(p.quote))?'generated':'added_by_review'}));
 });
 for(const q of ['identity','reason','scene','natural','non_redundant','room_style'])if(raw?.quality?.[q]!=='supported')failures.push({rule:'quality_'+q+'_'+(raw?.quality?.[q]||'missing'),sentence:null});
 return {ok:failures.length===0,failures,evidence,additionalEvidence:evidence.flat().filter(p=>p.approvalEvidence==='added_by_review')};
}
function publication(item,draft,review){const machine=inspect(item,draft);const ai=assessReview(item,draft,review);const failures=[...machine.failures,...ai.failures];return {status:failures.length?'blocked':'ready',reasons:failures,text:failures.length?'':draft.sentences.map(s=>normalize(s.text)).join('\n\n')+'\n\n※アフィリエイト広告を利用しています',ledger:ai.evidence,additionalEvidence:ai.additionalEvidence,machine,review:ai};}
module.exports={normalize,bind,inspect,assessReview,publication,questions};
