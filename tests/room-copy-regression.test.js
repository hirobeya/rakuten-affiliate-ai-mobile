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
for(const id of ['S1','S6','S8']){
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
  const ids=['P1','P9','P10'];
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
if(!appHtml.includes('この商品は自動判定の対象外のため、商品名と価格のみ表示しています。')) fail('fallback-ui','fallback guidance message missing');
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

if(failures){
  console.error(`ROOM copy regression failures: ${failures}`);
  process.exit(1);
}
console.log(`ROOM copy regression passed: ${fixture.cases.length} fixed cases + ${quantityCases.length} quantity cases`);
