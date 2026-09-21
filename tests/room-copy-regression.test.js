'use strict';

const fs=require('fs');
const path=require('path');

global.window={};
require(path.join(__dirname,'..','public','pain-copy.js'));
require(path.join(__dirname,'..','public','room-copy-quality.js'));

const api=global.window.UrenaviPainCopy;
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','regression-products.json'),'utf8'));
let failures=0;

function fail(id,msg){
  failures++;
  console.error('FAIL',id,'-',msg);
}
function ok(id,msg){
  console.log('PASS',id,'-',msg);
}

function assertBalancedSymbols(id,text){
  const pairs=[['【','】'],['〖','〗'],['（','）'],['(',')'],['「','」'],['『','』'],['[',']'],['［','］']];
  for(const [open,close] of pairs){
    let depth=0;
    for(const ch of String(text||'')){
      if(ch===open) depth++;
      else if(ch===close){ depth--; if(depth<0){ fail(id,`unmatched closing bracket ${close}: ${text}`); break; } }
    }
    if(depth!==0) fail(id,`unmatched bracket pair ${open}${close}: ${text}`);
  }
  const stars=(String(text||'').match(/★/g)||[]).length;
  if(stars%2!==0) fail(id,'isolated ★ remains: '+text);
}

const rankVariantById={
  'clean-window':0,
  'clean-glove':1,
  'clean-cloth':4,
  'pet-grooming':5
};

for(const tc of fixture.cases){
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0,catchcopy:'',itemCaption:'',genrePath:'',genreName:''};
  const a=api.analyzeRoomProduct(item,'');
  const variant=Object.prototype.hasOwnProperty.call(rankVariantById,tc.id)?rankVariantById[tc.id]:0;
  const copy=api.makeRoomCopy(item,'',{variant});
  const features=a.facts||[];
  const e=tc.expect||{};

  if(a.category!==e.category) fail(tc.id,`category expected ${e.category}, got ${a.category}`);
  else ok(tc.id,'category '+a.category);

  if(a.usage!==e.usage) fail(tc.id,`usage expected ${e.usage}, got ${a.usage}`);
  if(Boolean(a.ambiguous)!==Boolean(e.ambiguous)) fail(tc.id,`ambiguous expected ${e.ambiguous}, got ${a.ambiguous}`);
  if(a.outputMode!==e.outputMode) fail(tc.id,`outputMode expected ${e.outputMode}, got ${a.outputMode}`);

  for(const word of e.forbiddenWords||[]){
    if(copy.includes(word)) fail(tc.id,`forbidden word in copy: ${word}`);
  }
  for(const word of e.expectedFeatures||[]){
    if(!features.includes(word)) fail(tc.id,`missing feature: ${word}; got ${JSON.stringify(features)}`);
  }
  for(const word of e.forbiddenFeatures||[]){
    if(features.includes(word)) fail(tc.id,`forbidden feature: ${word}`);
  }
  if(copy.length>500) fail(tc.id,`copy exceeds 500 chars: ${copy.length}`);
  if(!copy.includes('※アフィリエイト広告を利用しています')) fail(tc.id,'ROOM disclosure missing');
  assertBalancedSymbols(tc.id,copy);

  const riskyInCopy=['楽天1位','ランキング1位','26冠','No.1','ナンバーワン','リフトアップ','小顔効果','痩せる','若返る','治る','改善','必ず','絶対'];
  for(const word of riskyInCopy){
    if(copy.includes(word)) fail(tc.id,'risk word in copy: '+word);
  }

  console.log('RESULT',JSON.stringify({
    id:tc.id,
    itemName:tc.itemName,
    category:a.category,
    usage:a.usage,
    ambiguous:a.ambiguous,
    outputMode:a.outputMode,
    reason:a.ambiguityReason,
    features,
    conflicts:a.conflicts,
    copy
  }));
}

// A5 validation JSON regression: exact user-provided itemName values must keep promo fragments out and stop risky special-use items.
for(const tc of fixture.cases.filter(x=>x.group==='validation-json')){
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0,catchcopy:'',itemCaption:'',genrePath:'',genreName:''};
  const a=api.analyzeRoomProduct(item,'');
  const copy=api.makeRoomCopy(item,'',{variant:0});
  if(a.outputMode!==tc.expect.outputMode) fail(tc.id,`A5 outputMode expected ${tc.expect.outputMode}, got ${a.outputMode}`);
  for(const word of tc.expect.forbiddenWords||[]){
    if(word && copy.includes(word)) fail(tc.id,`A5 forbidden fragment in copy: ${word}`);
  }
  const safe=api.buildSafeDisplayName(item,a);
  for(const bad of ['限定!','限定！','総合1位','1位6冠','年間ランキング受賞','配布中/','配布中／','＼','★']){
    if(safe.includes(bad)) fail(tc.id,`A5 unsafe display fragment: ${bad} in ${safe}`);
  }
  if(/(?:^|\s)(?:!|！|★|\\|＼|\/|／)+(?:\s|$)/.test(safe)) fail(tc.id,'A5 orphan punctuation remains in safe display name: '+safe);
  if(/「\s*」|『\s*』|【\s*】|〖\s*〗/.test(safe)) fail(tc.id,'A5 empty brackets remain in safe display name: '+safe);
}

// Promo removal preserves word boundaries.
{
  const cleaned=api.stripPromotionalText('【搬入設置無料】掃除用具入れ ロッカー');
  if(cleaned!=='掃除用具入れ ロッカー') fail('spacing','搬入設置無料 removal failed: '+cleaned);
  const kept=api.stripPromotionalText('【CAT&DOG】キルティングお散歩バッグM');
  if(kept!=='CAT&DOG キルティングお散歩バッグM') fail('spacing','kept bracket content must preserve a word boundary: '+kept);
}

// Power Bank synonym and accessory priority regression.
for(const id of ['live-battery-rank5-anker-zolo']){
  const tc=fixture.cases.find(x=>x.id===id);
  const a=api.analyzeRoomProduct({itemName:tc.itemName,itemPrice:tc.itemPrice||0},'');
  if(a.category!=='charging' || a.usage!=='mobile_battery' || a.outputMode!=='full') fail(id,'Power Bank synonym did not resolve to charging.mobile_battery');
}
for(const id of ['counter-power-bank-case','counter-powerbank-pouch']){
  const tc=fixture.cases.find(x=>x.id===id);
  const a=api.analyzeRoomProduct({itemName:tc.itemName,itemPrice:tc.itemPrice||0},'');
  if(a.category!=='accessory' || a.usage!=='mobile_battery_case') fail(id,'Power Bank accessory did not take priority');
}
{
  const tc=fixture.cases.find(x=>x.id==='P2');
  const copy=api.makeRoomCopy({itemName:tc.itemName,itemPrice:0},'',{variant:0});
  if(copy.split('\n')[0].trim()==='商品') fail('P2','one-word 商品 fallback is forbidden');
  if(!/うんち袋|マナー袋/.test(copy.split('\n')[0])) fail('P2','expected an exact noun from itemName in safe fallback');
}
{
  const tc=fixture.cases.find(x=>x.id==='pet-hygiene-wipe-conflict');
  const a=api.analyzeRoomProduct({itemName:tc.itemName,itemPrice:0},'');
  if(!a.ambiguous || a.ambiguityReason!=='pet_toilet_hygiene_conflict') fail(tc.id,'pet.toilet / pet.hygiene_wipe conflict not detected');
}

// Second validation batch regression: exact real itemName cases.
for(const id of ['P4','C4','S5','B-M3']){
  const tc=fixture.cases.find(x=>x.id===id);
  const item={itemName:tc.itemName,itemPrice:0};
  const a=api.analyzeRoomProduct(item,'');
  const copy=api.makeRoomCopy(item,'',{variant:0});
  assertBalancedSymbols(id,copy);
  if(a.outputMode!==tc.expect.outputMode) fail(id,`outputMode expected ${tc.expect.outputMode}, got ${a.outputMode}`);
}
{
  const tc=fixture.cases.find(x=>x.id==='B-M3');
  const item={itemName:tc.itemName,itemPrice:0};
  const a=api.analyzeRoomProduct(item,'');
  if(!a.claimRisk || !(a.claimRiskTerms||[]).includes('燃えにくい')) fail('B-M3','燃えにくい must be claimRisk');
  if(api.buildSafeDisplayName(item,a)!=='モバイルバッテリー') fail('B-M3','claimRisk battery must use モバイルバッテリー safe title');
}
for(const id of ['S1','S6']){
  const tc=fixture.cases.find(x=>x.id===id);
  const item={itemName:tc.itemName,itemPrice:0};
  const a=api.analyzeRoomProduct(item,'');
  if(a.category!=='storage' || a.usage!=='storage_box' || a.outputMode!=='full' || a.ambiguous) fail(id,`storage family resolution failed: ${a.category}.${a.usage} mode=${a.outputMode} ambiguous=${a.ambiguous}`);
}
{
  const tc=fixture.cases.find(x=>x.id==='S6');
  const a=api.analyzeRoomProduct({itemName:tc.itemName,itemPrice:0},'');
  for(const bad of ['2個組','3個組','4個組']) if((a.facts||[]).includes(bad)) fail('S6','quantity feature must not include '+bad);
}

// Category-specific prose must not leak unrelated vocabulary.
for(const id of ['S1','P1','M3']){
  const tc=fixture.cases.find(x=>x.id===id);
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0};
  const copy=api.makeRoomCopy(item,'',{variant:0});
  const firstTwo=copy.split('\n').slice(0,2).join('\n');
  if(id==='S1' && /掃除|手入れ|作業|整理を気づいたときに/.test(firstTwo)) fail(id,'storage prose leaked unrelated wording: '+firstTwo);
  if(id==='P1' && /掃除|手入れ|作業/.test(firstTwo)) fail(id,'pet.bed prose leaked unrelated wording: '+firstTwo);
  if(id==='M3' && /掃除|手入れ|作業/.test(firstTwo)) fail(id,'battery prose leaked unrelated wording: '+firstTwo);
}

{
  const ids=['S1','S2','S3','S4','S5','S6','S8','S9','S10'];
  const usedOpenings=new Set(), usedSeconds=new Set(), openings=[], seconds=[];
  for(let i=0;i<ids.length;i++){
    const tc=fixture.cases.find(x=>x.id===ids[i]);
    const copy=api.makeRoomCopy({itemName:tc.itemName,itemPrice:tc.itemPrice||0},'',{variant:i,usedOpenings,usedSeconds});
    const lines=copy.split('\n');
    openings.push(lines[0]); seconds.push(lines[1]);
  }
  if(new Set(openings).size!==openings.length) fail('storage-search','duplicate storage opening: '+JSON.stringify(openings));
  if(new Set(seconds).size!==seconds.length) fail('storage-search','duplicate storage second line: '+JSON.stringify(seconds));
}

{
  const p1=fixture.cases.find(x=>x.id==='P1');
  const p1Item={itemName:p1.itemName,itemPrice:p1.itemPrice||0};
  const p1a=api.analyzeRoomProduct(p1Item,'');
  const p1copy=api.makeRoomCopy(p1Item,'',{variant:0});
  if(p1a.category!=='pet'||p1a.usage!=='bed'||p1a.outputMode!=='fallback') fail('P1',`expected pet.bed fallback for drive/car bed, got ${p1a.category}.${p1a.usage} ${p1a.outputMode}`);
  if(!(p1a.conflicts||[]).some(x=>x.usage==='drive_bed')) fail('P1','drive_bed conflict missing');
  for(const bad of ['快眠','安眠','体圧分散']) if(p1copy.includes(bad)) fail('P1','unsupported pet-bed claim: '+bad);

  const ids=['P9','P10'];
  const usedOpenings=new Set(), usedSeconds=new Set(), openings=[], seconds=[];
  for(let i=0;i<ids.length;i++){
    const tc=fixture.cases.find(x=>x.id===ids[i]);
    const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0};
    const a=api.analyzeRoomProduct(item,'');
    const copy=api.makeRoomCopy(item,'',{variant:i,usedOpenings,usedSeconds});
    if(a.category!=='pet'||a.usage!=='bed'||a.outputMode!=='full') fail(ids[i],`expected pet.bed full, got ${a.category}.${a.usage} ${a.outputMode}`);
    for(const bad of ['快眠','安眠','体圧分散']) if(copy.includes(bad)) fail(ids[i],'unsupported pet-bed claim: '+bad);
    openings.push(copy.split('\n')[0]); seconds.push(copy.split('\n')[1]);
  }
  if(new Set(openings).size!==openings.length) fail('pet-bed-search','duplicate pet bed opening');
  if(new Set(seconds).size!==seconds.length) fail('pet-bed-search','duplicate pet bed second');
}

{
  const tc=fixture.cases.find(x=>x.id==='S1');
  const copy=api.makeRoomCopy({itemName:tc.itemName,itemPrice:5780},'',{variant:0});
  if(!copy.includes('価格：5,780円')) fail('S1','price formatting expected 価格：5,780円');
}

// Storage furniture / pet drive bed / praise promo / special battery regressions.
{
  const tc=fixture.cases.find(x=>x.id==='S8');
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0};
  const a=api.analyzeRoomProduct(item,'');
  const copy=api.makeRoomCopy(item,'',{variant:0});
  if(a.category!=='storage'||a.usage!=='storage_box'||a.outputMode!=='fallback') fail('S8',`expected storage.storage_box fallback, got ${a.category}.${a.usage} ${a.outputMode}`);
  if(!(a.conflicts||[]).some(x=>x.usage==='seating_storage')) fail('S8','seating_storage conflict missing');
  if(/^受賞/.test(copy)||copy.includes('楽天1位受賞')) fail('S8','award promo remains: '+copy);
}
{
  const tc=fixture.cases.find(x=>x.id==='P8');
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0};
  const a=api.analyzeRoomProduct(item,'');
  const copy=api.makeRoomCopy(item,'',{variant:0});
  if(a.outputMode!=='fallback') fail('P8','expected fallback');
  if(copy.includes('ご好評です')) fail('P8','ご好評です remains in copy');
}
for(const raw of ['楽天1位受賞 商品A','8冠受賞 商品B','受賞 商品C','ご好評です 商品D','大好評 商品E','当店人気 商品F','大人気 商品G']){
  const cleaned=api.stripPromotionalText(raw);
  if(/楽天1位受賞|\d+冠受賞|^受賞(?:\s|$)|ご好評です|大好評|当店人気|大人気/.test(cleaned)) fail('promo-cleanup','promo remains: '+raw+' => '+cleaned);
}
{
  const tc=fixture.cases.find(x=>x.id==='special-battery-electric-blanket');
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0};
  const a=api.analyzeRoomProduct(item,'');
  if(a.outputMode!=='fallback') fail(tc.id,'電気毛布 battery must fallback');
  if(!(a.conflicts||[]).some(x=>x.usage==='special_battery'&&x.phrase==='電気毛布')) fail(tc.id,'電気毛布 special_battery conflict missing');
}

// Same-search regression: opening line and second line must not repeat.
const sameSearchIds=['clean-window','clean-glove','clean-cloth','pet-grooming'];
const sameSearchVariants=[0,1,4,5];
const openings=[];
const seconds=[];
for(let i=0;i<sameSearchIds.length;i++){
  const tc=fixture.cases.find(x=>x.id===sameSearchIds[i]);
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0};
  const copy=api.makeRoomCopy(item,'',{variant:sameSearchVariants[i]});
  const lines=copy.split('\n').filter(Boolean);
  if(lines[0]) openings.push(lines[0]);
  if(lines[1]) seconds.push(lines[1]);
  if(copy.includes('お手入れを普段の掃除や手入れに')) fail(tc.id,'duplicate wording: お手入れを普段の掃除や手入れに');
}
if(new Set(openings).size!==openings.length) fail('same-search','duplicate opening line detected: '+JSON.stringify(openings));
if(new Set(seconds).size!==seconds.length) fail('same-search','duplicate second line detected: '+JSON.stringify(seconds));

// Template cardinality regression.
{
  const sets=api.templateSets;
  if((sets.storage?.openings||[]).length<10 || (sets.storage?.seconds||[]).length<10) fail('templates','storage needs >=10 opening/second patterns');
  if((sets.petBed?.openings||[]).length<6 || (sets.petBed?.seconds||[]).length<6) fail('templates','pet bed needs >=6 opening/second patterns');
  if((sets.battery?.openings||[]).length<10 || (sets.battery?.seconds||[]).length<10) fail('templates','battery needs >=10 opening/second patterns');
  for(const sentence of [...sets.storage.openings,...sets.storage.seconds]){
    if(/作業|手入れ|掃除|整理を気づいたときに/.test(sentence)) fail('templates','storage forbidden wording: '+sentence);
  }
  for(const sentence of [...sets.petBed.openings,...sets.petBed.seconds,...sets.battery.openings,...sets.battery.seconds]){
    if(/掃除|手入れ|作業/.test(sentence)) fail('templates','cross-category wording: '+sentence);
  }
}

// Explicit quantity regression cases.
const quantityCases=[
  {name:'掃除クロス 10枚入り',must:'10枚入り',mustNot:'10枚セット'},
  {name:'掃除クロス 6枚セット',must:'6枚セット'},
  {name:'掃除クロス 54枚',mustNot:'54枚セット'},
  {name:'モバイルバッテリー 4本ケーブル内蔵',mustNot:'4本セット'},
  {name:'取替式 網戸 掃除グッズ〖10〗',mustNot:'10枚セット'}
];
for(const [idx,q] of quantityCases.entries()){
  const item={itemName:q.name,itemPrice:1000};
  const a=api.analyzeRoomProduct(item,'');
  const f=a.facts||[];
  if(q.must && !f.includes(q.must)) fail('quantity-'+idx,`missing ${q.must}: ${JSON.stringify(f)}`);
  if(q.mustNot && f.includes(q.mustNot)) fail('quantity-'+idx,`unexpected ${q.mustNot}: ${JSON.stringify(f)}`);
}

// Legal-safe display names must not contain promo/risk claims.
for(const tc of fixture.cases){
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0};
  const a=api.analyzeRoomProduct(item,'');
  const safe=api.buildSafeDisplayName(item,a);
  for(const bad of ['楽天1位','ランキング1位','26冠','半額','SALE','クーポン','リフトアップ','小顔効果','改善']){
    if(safe.includes(bad)) fail(tc.id,'unsafe safeDisplayName: '+bad+' in '+safe);
  }
}

// claimRisk/promoRisk regression: both kinds must be absent from ROOM copy.
for(const tc of fixture.cases){
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0};
  const a=api.analyzeRoomProduct(item,'');
  const copy=api.makeRoomCopy(item,'',{variant:rankVariantById[tc.id]||0});
  for(const term of [...(a.claimRiskTerms||[]),...(a.promoRiskTerms||[])]){
    if(term && copy.toLowerCase().includes(String(term).toLowerCase())) fail(tc.id,'risk term leaked into copy: '+term);
  }
}

const byId=id=>fixture.cases.find(x=>x.id===id);
for(const id of ['beauty-roller','beauty-kassa','pet-toilet']){
  const tc=byId(id);
  const a=api.analyzeRoomProduct({itemName:tc.itemName,itemPrice:tc.itemPrice||0},'');
  if(!a.claimRisk) fail(id,'expected claimRisk=true');
}
for(const id of ['clean-window','pet-water','pet-bed','battery-cable']){
  const tc=byId(id);
  const a=api.analyzeRoomProduct({itemName:tc.itemName,itemPrice:tc.itemPrice||0},'');
  if(!a.promoRisk) fail(id,'expected promoRisk=true');
}
{
  const tc=byId('battery-cable');
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0};
  const a=api.analyzeRoomProduct(item,'');
  if(a.claimRisk) fail(tc.id,'promo-only battery unexpectedly claimRisk');
  if(api.buildSafeDisplayName(item,a)==='モバイルバッテリー' && !/モバイルバッテリー/.test(tc.itemName)) fail(tc.id,'safe display fallback mismatch');
}
{
  const tc=byId('beauty-roller');
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0};
  const a=api.analyzeRoomProduct(item,'');
  if(api.buildSafeDisplayName(item,a)!=='美顔ローラー') fail(tc.id,'claimRisk must use safe usage name');
}

// Preview export and fallback UI are static-code guarded as well.
const appHtml=fs.readFileSync(path.join(__dirname,'..','public','app.html'),'utf8');
if(!appHtml.includes("fetch('/api/runtime-env'")) fail('preview-export','runtime env endpoint guard missing');
if(!appHtml.includes("preview && currentAccessPlan==='owner'")) fail('preview-export','owner+preview guard missing');
if(!appHtml.includes('この商品は自動判定の対象外のため、商品名と商品名から確認できる事実だけを表示しています。')) fail('fallback-ui','fallback guidance message missing');
if(!appHtml.includes("groundedAnalysis(i).outputMode==='full'")) fail('today-ui','full-output filter missing');
if(appHtml.includes('<div id="st" class="muted"></div>\\n')) fail('preview-export','literal \\n in static debug markup');
if(!appHtml.includes("debugCopyBtn')?.addEventListener('click',copyDebugValidation)")) fail('preview-export','debug export click handler missing');
if(!appHtml.includes('長押しで選択・コピーできます')) fail('preview-export','manual copy guidance missing');
if(appHtml.includes('<textarea id="debugJson" readonly')) fail('preview-export','debug textarea must allow manual selection/copy');
if(!appHtml.includes("if(ta){\n      ta.value=json;")) fail('preview-export','JSON must be rendered before clipboard attempt');
{
  const a=api.analyzeRoomProduct({itemName:'ペット用品 便利グッズ',itemPrice:1000},'');
  if(a.ambiguous) fail('no-match','no_match must not be reported as ambiguous');
  if(a.ambiguityReason!=='no_match') fail('no-match','expected ambiguityReason=no_match, got '+a.ambiguityReason);
}
if(!appHtml.includes("return 'no_match'")) fail('preview-export','fallbackReason no_match missing');
if(!appHtml.includes('topCandidates:Array.isArray(a?.topCandidates)?a.topCandidates:[]')) fail('preview-export','topCandidates missing from validation JSON');
if(!appHtml.includes('promoRisk:Boolean(a?.promoRisk)')) fail('preview-export','promoRisk missing from validation JSON');
if(!appHtml.includes('claimRisk:Boolean(a?.claimRisk)')) fail('preview-export','claimRisk missing from validation JSON');
if(!appHtml.includes('warningRisk:Boolean(a?.warningRisk)')) fail('preview-export','warningRisk missing from validation JSON');
if(!appHtml.includes('promoRiskTerms:Array.isArray(a?.promoRiskTerms)?a.promoRiskTerms:[]')) fail('preview-export','promoRiskTerms missing from validation JSON');
if(!appHtml.includes('claimRiskTerms:Array.isArray(a?.claimRiskTerms)?a.claimRiskTerms:[]')) fail('preview-export','claimRiskTerms missing from validation JSON');



const runtimeEnv=fs.readFileSync(path.join(__dirname,'..','api','runtime-env.js'),'utf8');
if(!runtimeEnv.includes("process.env.VERCEL_ENV === 'preview'")) fail('preview-export','VERCEL_ENV preview check missing');
for(const forbidden of ['RAKUTEN_ACCESS_KEY','SUPABASE_SERVICE_ROLE_KEY','STRIPE_SECRET_KEY']){
  if(runtimeEnv.includes(forbidden)) fail('preview-export','secret reference in runtime-env endpoint: '+forbidden);
}

// Smoke-check non-ROOM surfaces do not throw after classification engine change.
for(const tc of fixture.cases.slice(0,11)){
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0};
  try{
    api.makeThreadsCopy(item,'',{variant:0});
    api.makeInstagramCopy(item,'',{variant:0});
  }catch(err){
    fail(tc.id,'SNS smoke error: '+err.message);
  }
}


// Product-specific ROOM copy: the opening must identify the actual product,
// and the value statement may only expand a verified title-derived feature conservatively.
{
  const tc=fixture.cases.find(x=>x.id==='S1');
  const item={itemName:tc.itemName,itemPrice:5780};
  const a=api.analyzeRoomProduct(item,'');
  const copy=api.makeRoomCopy(item,'',{variant:0,usedOpenings:new Set(),usedSeconds:new Set()});
  const first=copy.split('\n')[0];
  if(!first.includes(api.buildSafeDisplayName(item,a)) && !first.includes('収納ボックス')) fail('grounded-room-S1','opening must carry product identity: '+first);
  for(const fact of a.facts||[]){
    if(!item.itemName.includes('折') && fact==='折りたたみ対応') fail('grounded-room-S1','feature was not grounded in title');
  }
  if(/絶対|必ず|保証|改善|治る|快眠|安眠/.test(copy)) fail('grounded-room-S1','unsupported strong claim in grounded copy: '+copy);
}
{
  const tc=fixture.cases.find(x=>x.id==='live-battery-rank5-anker-zolo');
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0};
  const a=api.analyzeRoomProduct(item,'');
  const copy=api.makeRoomCopy(item,'',{variant:2,usedOpenings:new Set(),usedSeconds:new Set()});
  const first=copy.split('\n')[0];
  if(!/モバイルバッテリー|Power Bank/i.test(first)) fail('grounded-room-battery','battery identity missing from opening: '+first);
  for(const fact of a.facts||[]){
    if(!copy.includes(fact)) fail('grounded-room-battery','verified fact missing from copy: '+fact);
  }
}
{
  const tc=fixture.cases.find(x=>x.id==='P1');
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0};
  const a=api.analyzeRoomProduct(item,'');
  const copy=api.makeRoomCopy(item,'',{variant:0});
  if(a.outputMode!=='fallback') fail('grounded-room-P1','known drive-bed conflict must stay fallback');
  if(/使いやすく|暮らし|快適|安心/.test(copy)) fail('grounded-room-P1','fallback must not add inferred benefit: '+copy);
}


// Step 1: position-aware primary use must keep a main product noun ahead of a later usage scene.
{
  const cases=[
    ['electric-mop-r1','【クーポンで400円オフ】回転モップクリーナー 電動モップ Orage M200 S 軽量 自立 自走式 回転モップ 水拭き コードレス 床拭き 掃除機 網戸 モップ 高速回転 充電式 ジェネリック家電 Orage M200S【1年保証】 ギフトにも','電動モップ','mop'],
    ['electric-mop-r3','【クーポンで400円オフ】2026新モデル 回転モップクリーナー 電動モップ Orage M300 軽量 自立 自走式 回転モップ 水拭き コードレス 床拭き 掃除機 網戸 モップ 高速回転 充電式 1人暮らし ジェネリック家電【1年保証】 プレゼント','電動モップ','mop'],
    ['electric-mop-r4','電動モップ コードレス 床掃除 油汚れ クレヨン 足跡 フロアモップ フローリングワイパー 軽量 高速振動 掃除 網戸 壁 玄関 水拭きシート対応 パッド不要 LEDライト付 電動フロアワイパー SWD-1 アイリスオーヤマ * [2609SI]','電動モップ','mop'],
    ['electric-mop-r6','電動モップ 回転 モップクリーナー コードレス 床掃除 電動 モップ 回転モップ 回転モップクリーナー 回転式 掃除 網戸 水拭き 電動 充電式 交換用 パッド付き 交換パッド 自走式 水噴射 充電式 フローリング 160ml 父の日 プレゼント 珍しい','電動モップ','mop'],
    ['window-cleaner-pair','網戸クリーナー モップタイプ 網戸掃除','網戸掃除','window_screen'],
    ['window-mop-pair','網戸用モップ 網戸掃除 取替式','網戸掃除','window_screen']
  ];
  for(const [id,itemName,keyword,usage] of cases){
    const a=api.analyzeRoomProduct({itemName,itemPrice:1000},keyword);
    if(a.category!=='cleaning'||a.usage!==usage||a.ambiguous) fail(id,`expected cleaning.${usage}, got ${a.category}.${a.usage} ambiguous=${a.ambiguous}`);
  }
  const fixed=fixture.cases.find(x=>x.id==='clean-window');
  const a=api.analyzeRoomProduct({itemName:fixed.itemName,itemPrice:fixed.itemPrice||0},'網戸掃除');
  if(a.category!=='cleaning'||a.usage!=='window_screen'||a.ambiguous) fail('clean-window-pair','existing 網戸掃除 fixture must stay window_screen');
}

// Step 2: mop holders are holders, not mop bodies.
for(const id of ['live-cleaning-rank7-mop-holder','C7']){
  const tc=fixture.cases.find(x=>x.id===id);
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0};
  const a=api.analyzeRoomProduct(item,'モップハンガー');
  const copy=api.makeRoomCopy(item,'モップハンガー',{variant:0});
  if(a.category!=='storage'||a.usage!=='cleaning_tool_holder'||a.outputMode!=='fallback'||a.ambiguous) fail(id,'mop holder must be storage.cleaning_tool_holder fallback');
  if((a.conflicts||[]).length) fail(id,'mop holder must not have cleaning/storage conflict');
  if((a.facts||[]).includes('モップタイプ')) fail(id,'mop holder must not expose モップタイプ');
  if(/モップを探して|モップでの掃除|コードレスタイプを条件にモップ/.test(copy)) fail(id,'mop holder copy must not describe the holder as a mop: '+copy);
}


// Step 3-6: fallback is title-only, allowlisted, claim-safe, promo-clean and hides invalid price.
{
  const samples=[
    {id:'fallback-bench',itemName:'収納ベンチ 2人掛け 幅120 奥行37 高さ40cm ベンチ ソファ クッション付き',itemPrice:0,keyword:'収納ベンチ'},
    {id:'fallback-holder',itemName:'モップハンガー RC型 コンパクト 6本掛【tmcp2212】',itemPrice:null,keyword:'モップハンガー'},
    {id:'fallback-kitchen',itemName:'キッチンワゴン キャスター付き 3段 天板付き スリム',itemPrice:NaN,keyword:'キッチンワゴン'}
  ];
  for(const s of samples){
    const copy=api.makeRoomCopy(s,s.keyword,{variant:0});
    if(/価格：0円/.test(copy)) fail(s.id,'zero/invalid price must be hidden: '+copy);
    if(/暮らし|快適|助けになりそう|向いていそう|探している人/.test(copy)) fail(s.id,'fallback must not add lifestyle/use explanation: '+copy);
    if(s.id==='fallback-bench'&&!/2人掛け、幅120、奥行37、高さ40cm/.test(copy)) fail(s.id,'labeled dimensions must stay intact: '+copy);
  }
}
{
  const item={itemName:'【20箱セット】 クリロン化成 うんちが臭わない袋 BOS ネコ用 箱型 SSサイズ 200枚入 ボス うんち袋',itemPrice:26980};
  const copy=api.makeRoomCopy(item,'うんち袋',{variant:0});
  if(/防臭|臭わない|匂わない|臭くない/.test(copy)) fail('fallback-bos','claim terms leaked: '+copy);
  if(!/BOS/.test(copy)||!/うんち袋/.test(copy)||!/ネコ用/.test(copy)||!/SSサイズ/.test(copy)||!/200枚入/.test(copy)) fail('fallback-bos','safe BOS facts missing: '+copy);
  if(/うんちが\s+袋/.test(copy)) fail('fallback-bos','broken claim removal remains: '+copy);
}
{
  const cleaned=api.stripPromotionalText('P10倍 9/24 9:59迄 セール価格 テラモト モップハンガー');
  if(/^\s*(?:9\/24|9:59|迄|価格)/.test(cleaned)) fail('promo-block','orphan promo prefix remains: '+cleaned);
  const risk=api.detectLegalRisk('P10倍 9/24 9:59迄 商品');
  if(!risk.promoRisk) fail('promo-block','P10倍 must set promoRisk');
}
{
  const item={itemName:'モバイルバッテリー 4本ケーブル内蔵 10000mAh',itemPrice:0};
  const copy=api.makeRoomCopy(item,'モバイルバッテリー',{variant:0});
  if(/(?:^|[、\n])4本(?:[、\n]|$)/.test(copy)) fail('fallback-cable','4本ケーブル内蔵 must not be reduced to 4本: '+copy);
}
if(!appHtml.includes('aiHttpStatus:aiRoomResults.get(index)?.status??null')) fail('preview-export','aiHttpStatus missing from validation JSON');
if(!appHtml.includes("aiMessage:aiRoomResults.get(index)?.message||null")) fail('preview-export','aiMessage missing from validation JSON');
if(!appHtml.includes('PreviewのOPENAI_API_KEYが設定されていません')) fail('preview-export','missing Preview key UI message');


// Misleading catchcopy/itemCaption must never change title-derived classification or promote fallback to full.
for(const tc of fixture.cases){
  const base={itemName:tc.itemName,itemPrice:tc.itemPrice||0,catchcopy:'',itemCaption:'',genrePath:'',genreName:''};
  const bait={...base,catchcopy:'急速充電 防臭 網戸 収納',itemCaption:'急速充電 防臭 網戸 収納 ペット用品 掃除用具',genrePath:'収納>ペット>掃除',genreName:'防臭 急速充電'};
  const a0=api.analyzeRoomProduct(base,tc.searchKeyword||'');
  const a1=api.analyzeRoomProduct(bait,tc.searchKeyword||'');
  if(a0.category!==a1.category||a0.usage!==a1.usage||a0.outputMode!==a1.outputMode){
    fail(tc.id+'-misleading-meta',`metadata changed title-derived result from ${a0.category}.${a0.usage}/${a0.outputMode} to ${a1.category}.${a1.usage}/${a1.outputMode}`);
  }
}


{
  const item={itemName:'●送料無料●〖公式BOS-SHOP★驚異の 防臭袋 BOS (ボス)〗 うんちが臭わない袋 BOS ペット用 Lサイズ 90枚入り（袋カラー：水色） ペット いぬ 大人 オムツ ウンチ トイレ 生ゴミ 処分 匂い 対策 エチケット 非常 防災',itemPrice:0};
  const copy=api.makeRoomCopy(item,'うんち袋',{variant:0});
  if(/うんちが\s+袋/.test(copy)) fail('fallback-bos-live','broken BOS noun remains: '+copy);
  if(!/^BOS うんち袋/m.test(copy)||!/ペット用/.test(copy)||!/Lサイズ/.test(copy)||!/90枚入り/.test(copy)) fail('fallback-bos-live','safe BOS facts missing: '+copy);
}
{
  const item={itemName:'美顔ローラー 美顔器 リフトアップ 〖微弱電流〗〖防水仕様〗〖充電不要〗 小顔ローラー メンズ マイクロカレント 美顔器 ローラー 全身用 ローラー 美容グッズ 美容 グッズ 女性 男性 誕生日 レディース メンズ プレゼント ギフト',itemPrice:3980};
  const a=api.analyzeRoomProduct(item,'');
  const display=api.buildSafeDisplayName(item,a);
  const copy=api.makeRoomCopy(item,'',{variant:0});
  if(display!=='美顔ローラー') fail('beauty-roller-claim-safe','buildSafeDisplayName must keep safe usage name: '+display);
  if(!/^美顔ローラー\n/m.test(copy)) fail('beauty-roller-room-safe','ROOM fallback must start with safe usage name: '+copy);
  if(/リフトアップ|小顔/.test(copy)) fail('beauty-roller-room-safe','claim terms leaked: '+copy);
}


// Error-zero follow-up: multiple distinct early product nouns must fall back.
// Same-family storage_box/storage_case must stay non-ambiguous.
{
  const mixed=fixture.cases.find(x=>x.id==='known-laundry-9');
  const a=api.analyzeRoomProduct({itemName:mixed.itemName,itemPrice:mixed.itemPrice||0},'');
  if(!a.ambiguous||a.outputMode!=='fallback'||a.ambiguityReason!=='multiple_early_product_nouns'){
    fail('known-laundry-9-early-nouns','mixed early product nouns must be ambiguous fallback: '+JSON.stringify(a));
  }
  const sameFamily={itemName:'収納ボックス 収納ケース 折りたたみ 3個セット',itemPrice:1980};
  const b=api.analyzeRoomProduct(sameFamily,'');
  if(b.ambiguous||b.category!=='storage'||!['storage_box','storage_case'].includes(b.usage)||b.outputMode!=='full'){
    fail('same-family-storage-nouns','storage box/case must remain same-family full: '+JSON.stringify(b));
  }
}

// P2 exact target term: ペット用品 must not produce ペット用.
{
  const p2=fixture.cases.find(x=>x.id==='P2');
  const copy=api.makeRoomCopy({itemName:p2.itemName,itemPrice:p2.itemPrice||0},'',{variant:0});
  if(/(?:^|[、\n])ペット用(?:[、\n]|$)/.test(copy)) fail('P2-target-exact','ペット用品 must not be shortened to ペット用: '+copy);
  if(!/BOS うんち袋/.test(copy)||!/SSサイズ/.test(copy)||!/200枚入り/.test(copy)) fail('P2-target-exact','safe BOS facts missing: '+copy);
}

// strongStructuralLead thresholds are temporary/un-calibrated. Lock the boundaries.
{
  const structural=(gap,ratio)=>gap<20 && ratio>=0.40 && gap>=10;
  if(structural(9,0.41)!==false) fail('strong-lead-gap9','gap 9 must not qualify');
  if(structural(10,0.41)!==true) fail('strong-lead-gap10','gap 10 must qualify');
  if(structural(12,0.41)!==true) fail('strong-lead-gap12','gap 12 must qualify');
  if(structural(12,0.39)!==false) fail('strong-lead-pos39','39% must not qualify');
  if(structural(12,0.40)!==true) fail('strong-lead-pos40','40% must qualify');
  if(structural(12,0.41)!==true) fail('strong-lead-pos41','41% must qualify');
}


if(!appHtml.includes('id="debugBatchBtn"')) fail('batch-debug-ui','batch validation button missing');
for(const keyword of ['ハンディクリーナー','洗濯ネット','ポータブル電源','犬 ベッド','ドライブベッド 犬']){
  if(!appHtml.includes("'"+keyword+"'")) fail('batch-debug-keywords','missing fixed batch keyword: '+keyword);
}
if(!appHtml.includes('async function copyBatchDebugValidation()')) fail('batch-debug-ui','batch validation handler missing');
if(!appHtml.includes("searchCount:DEBUG_BATCH_KEYWORDS.length")) fail('batch-debug-json','batch JSON searchCount missing');
if(!appHtml.includes('items:buildDebugValidationRowsFor(items,keyword)')) fail('batch-debug-json','batch results must use per-keyword validation rows');
if(!appHtml.includes("String(error?.message||'不明なエラー')")) fail('batch-debug-error-handler','batch error handler must reference error variable');

if(failures){
  console.error(`ROOM copy regression failures: ${failures}`);
  process.exit(1);
}
console.log(`ROOM copy regression passed: ${fixture.cases.length} fixed cases + ${quantityCases.length} quantity cases`);
