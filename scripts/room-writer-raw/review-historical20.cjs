'use strict';
// Evidence export only. Run through scripts/rebuild/offline.sh; never dispatches.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const S=require('../../lib/room-writer-raw/source'),Q=require('../../lib/room-writer-raw/local-quality');
const E=require('../../lib/urenavi-core/last-resort'),R=require('../../lib/room-writer-raw/route');
const A=require('../../lib/room-writer-raw/audit'),Safety=require('../../lib/room-writer-raw/safety');
const root=path.resolve(__dirname,'../..');
const output=path.join(root,'docs/experiments/raw-source-fallback-20261111/quality-review-20261111');
const annotations=require('./review-historical20.json');
const set=require('../../tests/room-writer/eval-set.json');
const saved=require('../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
const executionSha='dae33a28be0de112e34cc93f8f69ed5c03b98b02';
const labels={understanding:'商品理解',specificity:'特徴の具体性',choice:'購入を検討する理由',audience_value:'対象者・利用場面・価値',naturalness:'自然さ・魅力',grounded:'根拠の正確性'};
const statusLabel={passed:'合格',failed:'不合格',unverified:'未確認'};
function write(name,value){const file=path.join(output,name);fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
async function main(){
 assert(process.execArgv.some(x=>x.includes('offline-guard.cjs')),'offline network/child-process guard required');
 assert.equal(process.argv.length,2,'no live or alternate-output arguments');
 assert.equal(set.historical.entries.length,20);assert.equal(annotations.length,20);
 fs.mkdirSync(path.join(output,'products'),{recursive:true});
 const rows=[];
 for(const [i,row]of set.historical.entries.entries()){
  const a=annotations[i];assert.equal(a.itemCode,row.itemCode);
  const item={catchcopy:'',...row.item},envelope=S.prepare(item),local=E.generate(item);
  assert.equal(local.groqCalls,0);
  const p=Q.packet({source:envelope.source,sourceHash:envelope.sourceHash,local,mode:'normal'});
  const old=saved.rows.find(x=>x.item.itemCode===row.itemCode);assert(old,'saved engine output missing');
  const text=local.result?.quality?.text??null;
  assert.equal(old.after||null,text,'historically saved output differs from offline replay');
  const axes=Object.fromEntries(Q.AXES.map((key,j)=>[key,a.axisValues[j]]));
  const observations=Q.AXES.map(key=>({axis:key,label:labels[key],verdict:axes[key]===null?'未確認':axes[key]?'合格':'不合格',reason:a.reasons[key],evidence:a.evidence}));
  for(const e of a.evidence)assert(envelope.source[e.field]?.includes(e.quote),'review source quote missing');
  if(text===null)assert(Q.AXES.every(k=>axes[k]===null),'no text must not become a quality failure');
  const receipt={version:Q.VERSION,sourceHash:p.sourceHash,outputHash:p.outputHash,localHash:p.localHash,
   reviewerId:'Work-independent-source-text-review-20261111',method:'independent_review',reviewerKind:'ai_assistant',humanApproval:false,
   status:a.status,reason:a.reason,axes,observations,failedPassages:a.failedPassages};
  const classified=Q.classify(receipt,p);assert.equal(classified.status,a.status);
  const routed=await R.prepareFallback({item,assessLocal:()=>receipt});
  assert.equal(routed.calls,0);
  if(a.status==='unverified')assert.equal(routed.status,'local_quality_unverified');
  if(a.status==='passed')assert.equal(routed.status,'reuse_quality_passed_local');
  const evidence={number:i+1,itemCode:row.itemCode,category:row.category,source:envelope.source,sourceHash:envelope.sourceHash,
   fieldHashes:envelope.fieldHashes,formattingHistory:envelope.formattingHistory,sourceProvenance:'Frozen acquired-field fixture; not a fresh Rakuten response or certification of complete seller page',
   storedEngineResultPath:'docs/rebuild-20261028/p3-local-first-20261108/evaluation.json',storedEngineResult:old,replayMatchesStored:true,
   generationText:text,characterCount:text===null?null:Array.from(text).length,publicationReady:false,
   outputAbsence:text===null?{reason:'Existing engine returned null; no assessable post body',diagnostic:local.diagnostic}:null,
   localResult:local,qualityPacket:p,independentAssessment:receipt,qualityStatus:classified.status,
   route:{status:routed.status,qualityState:routed.qualityState,reason:routed.reason??null,calls:routed.calls},
   limitations:['Single assistant review, not a separate human or blind customer review','No actual provider generation or runtime adoption','No new seller-page fetch; snapshot prices are historical']};
  write(`products/${String(i+1).padStart(2,'0')}.json`,evidence);
  rows.push({number:i+1,itemCode:row.itemCode,category:row.category,status:a.status,statusJa:statusLabel[a.status],axes,reason:a.reason,textAvailable:text!==null,characterCount:evidence.characterCount,sourceHash:envelope.sourceHash,outputHash:p.outputHash,localHash:p.localHash,route:evidence.route,evidencePath:`products/${String(i+1).padStart(2,'0')}.json`});
 }
 const candidateIndex=11,a=annotations[candidateIndex],item=set.historical.entries[candidateIndex].item;
 assert.equal(a.itemCode,'emoor-nedogko:10000048');assert.equal(a.status,'failed');
 const detail=JSON.parse(fs.readFileSync(path.join(output,'products/12.json'),'utf8'));
 const prepared=await R.prepareFallback({item,assessLocal:()=>detail.independentAssessment});
 assert.equal(prepared.status,'fallback_prepared_not_authorized');assert.equal(prepared.bundle.held,false);
 const auditDirectory=path.join(output,A.DIRECTORY_NAME);
 const audit=A.open({directory:auditDirectory,create:true,budgetTokens:prepared.bundle.reservation});
 const state=audit.state(),target=Safety.initialApprovalTarget({prepared,state,executionSha});
 assert.equal(target.eligible,true);assert.equal(target.template.authorized,false);assert.equal(state.attemptsTotal,0);
 assert.equal(target.template.acceptUnknownCapacity,false);assert.equal(target.template.expiresAt,null);
 const bundle=prepared.bundle;
 write('candidate-request.json',bundle.request);
 write('approval-target.NOT-AUTHORIZED.json',target);
 write('candidate.json',{itemCode:item.itemCode,itemName:item.itemName,source:bundle.envelope.source,
  groqInputUserContent:bundle.request.messages[1].content,requestPath:'candidate-request.json',generationText:detail.generationText,
  independentAssessment:detail.independentAssessment,sourceHash:bundle.envelope.sourceHash,fieldHashes:bundle.envelope.fieldHashes,
  requestHash:bundle.requestHash,inputHash:bundle.inputHash,qualityHash:S.hash(prepared.quality),outputHash:detail.qualityPacket.outputHash,localHash:detail.qualityPacket.localHash,
  executionSha,inputEstimatedReservation:bundle.inputEstimate,outputTokenCap:bundle.request.max_completion_tokens,totalTokenReservation:bundle.reservation,
  tokensAreEstimatesNotMeasured:true,observedCurrentRemaining:{minuteTokens:null,dailyTokens:null,dailyRequests:null},
  limits:{model:bundle.request.model,reasoning_effort:bundle.request.reasoning_effort,lastKnownRpm:30,lastKnownRpd:1000,lastKnownTpm:8000,lastKnownTpd:200000,currentRevalidationRequired:true},
  priorEvidencePath:'prior-evidence-index.json',priorMeasurementScope:'No live request for this item found in preserved repository evidence; provider full history is not verified',
  sourceSufficiency:{adequateForScopeChallenge:true,evidence:'Full saved regular and premium model paragraphs are present; no additional truncation/summarization in this request',
   selectedVariantConfirmed:false,sellerPageCompletenessConfirmed:false,catchcopyOriginalEmptyConfirmed:false,snapshotTail:'安定するので、特に小型犬やシニア犬にも安心',
   restriction:'Unknown selected variant/unit must stay unknown; use explicitly scoped wording only when justified, otherwise hold. Never infer that all models have 3D structure.'},
  newAudit:{directory:auditDirectory,state,notAProviderUsageLedger:true,pathBoundAuditId:true,relocationRequiresNewAuditIdAndNewApproval:true},
  initialApprovalTargetPath:'approval-target.NOT-AUTHORIZED.json',realGroqCalls:0,actualTokens:null,responseLatencyMs:null,
  liveSafetyRequired:['New explicit one-call approval bound to SHA/source/request/quality/experiment/audit','Recheck isolated execution SHA, no network except approved provider, no images','Reconcile provider logs and all available experiment records for this item before any request','Fresh official limits and observed usage with coverage and period; null balances remain null','Fresh exclusive state, no unresolved prior consumption; one durable attempt before dispatch','Budget 6120 estimated tokens; observed insufficiency vetoes; no automatic retries','Stop on 429, unknown usage/outcome, save failure; no duplicate dispatch','Independent full source/draft/notes/tags review after success; no automatic publication'],
  notObserved:['Current Groq capacity/usage and effective limits','Provider Console full history for candidate','Current isolated Sandbox survival/network/secret setup','Real raw-source output quality and tokens'],
  noRuntimeAdoption:true});
 const summary={executionSha,sourceSetPath:'tests/room-writer/eval-set.json',sourceSetHash:S.hash(fs.readFileSync(path.join(root,'tests/room-writer/eval-set.json'),'utf8')),
  storedOutputSource:'docs/rebuild-20261028/p3-local-first-20261108/evaluation.json',storedOutputReplayMatches:20,
  method:'Read full frozen source and actual stored output independently. Assistant editorial judgments, not machine readiness, old labels, or human certification.',
  counts:{total:20,withText:4,withoutText:16,passed:rows.filter(r=>r.status==='passed').length,failed:rows.filter(r=>r.status==='failed').length,unverified:rows.filter(r=>r.status==='unverified').length},
  axes:labels,rows,selectedCandidate:item.itemCode,realGroqCalls:0,actualTokens:null,liveAuthorizationIssued:false,
  commonCauses:['Extracted sentence loses preceding model scope, despite exact lexical quotation','A correct feature can still omit the reader situation and concrete purchase reason','Source headings leak into the post','No-output veto diagnoses do not establish six-axis writing quality','Ambiguous naturalness needs further editorial assessment, never automatic fallback'],
  runtimeFilesChanged:false,oldEvidenceChanged:false,scope:'Evidence and offline tooling only; passed label applies to this source/text snapshot, not product launch certification'};
 write('index.json',summary);
 let md='# 保存済み20商品・独立品質評価（2026-11-11）\n\n';
 md+='実Groq通信0回。保存済み文章を取得し、ネットワーク・子プロセスを遮断した再生成と20/20一致。原文は凍結された取得フィールドであり、現在の楽天ページ全体の取得証明ではない。評価者はWork（AI assistant）。人間の審査・顧客テストではない。自動判定や以前の評価を合否の根拠にしない。\n\n';
 md+='|No.|商品|品質|理由|\n|---|---|---|---|\n'+rows.map(r=>`|${r.number}|${r.itemCode} ${r.category}|${r.statusJa}|${r.reason}|`).join('\n')+'\n\n';
 for(const row of rows){const d=JSON.parse(fs.readFileSync(path.join(output,row.evidencePath),'utf8'));md+=`## ${row.number}. ${row.itemCode} ${row.category} — ${row.statusJa}\n\n### 取得原文（未改変）\n\n`+'```json\n'+JSON.stringify(d.source,null,2)+'\n```\n\n### 既存独自エンジン生成文章全文\n\n'+(d.generationText===null?'本文なし。生成文章を捏造しない。既存保留理由：'+d.outputAbsence.diagnostic?.reason:'```text\n'+d.generationText+'\n```')+'\n\n|項目|判定|理由|\n|---|---|---|\n'+d.independentAssessment.observations.map(o=>`|${o.label}|${o.verdict}|${o.reason}|`).join('\n')+'\n\n根拠：\n\n'+(d.independentAssessment.observations[0].evidence.map(e=>`- ${e.field}: ${e.quote}`).join('\n')||'本文なしのため文章と原文の対応は未確認。')+'\n\n不合格箇所：'+(d.independentAssessment.failedPassages.join(' / ')||'明確な不合格箇所は特定していない。未確認は合格も不合格も意味しない。')+'\n\n';}
 md+='## 共通原因・次回条件\n\n'+summary.commonCauses.map(x=>'- '+x).join('\n')+'\n\n候補：emoor-nedogko:10000048。原文のモデル条件欠落を今回新たに確認。旧評価のgrounded=passは変更せず保存し、今回の新評価に差分理由を記録。過去の引用だけの照合では適用モデルが確認できていなかった。\n\n承認対象のみ作成。authorized=false / acceptUnknownCapacity=false / expiresAt=null。新規auditはmanifestだけで、送信予約・attempt・claimは作成していない。auditIdは絶対パスに結び付くため移設時は再計算・再承認が必要。実行SHAは既存の検証済みdae33…で固定し、この証拠追加コミット自体への実行承認は発行していない。\n\n取得原文は末尾が「安心」で終わり、販売ページ全体の完全性は証明していない。ただしレギュラー/プレミアム・年代別素材の比較段落は保存されており、今回のモデル混同の評価材料は十分。選択されたモデル・販売単位は未確定として扱い、Groqも推測せず必要なら保留する。\n\n機械的整合性テストは文章品質の合格証明ではない。実測方式の品質改善・安定性は未実証。\n';
 write('review.md',md);
 console.log(JSON.stringify({counts:summary.counts,candidate:item.itemCode,reservation:bundle.reservation,sourceHash:bundle.envelope.sourceHash,requestHash:bundle.requestHash,qualityHash:S.hash(prepared.quality),experimentId:state.experimentId,auditId:state.auditId,calls:0}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
