const fs=require('fs');
const vm=require('vm');

const code=fs.readFileSync('public/product-shadow-v2.js','utf8');
const sandbox={window:{},globalThis:{}};
sandbox.globalThis=sandbox.window;
vm.runInNewContext(code,sandbox);
const api=sandbox.window.UrenaviProductShadowV2;

let failures=0;
function fail(id,msg){ failures++; console.error('FAIL',id,msg); }
function ok(cond,id,msg){ if(!cond) fail(id,msg); }

function analyze(id,query,itemName){
  const a=api.analyze({itemName},query||'');
  ok(a.featureFlags.genericFull===false,id,'genericFull must stay false');
  ok(a.featureFlags.benefitCopy===false,id,'benefitCopy must stay false');
  ok(a.featureFlags.queryCanPromote===false,id,'queryCanPromote must stay false');
  ok(a.validation.allSpansGrounded===true,id,'every span must be title-grounded');
  for(const s of a.spans){
    ok(itemName.slice(s.start,s.end)===s.text,id,'bad span '+JSON.stringify(s));
  }
  return a;
}

{
  const a=analyze('drive-bed','ドライブベッド','ドライブベッド 犬 車 シート 伸縮リード2本付 洗える 後部座席対応');
  ok(a.primaryProduct?.text==='ドライブベッド','drive-bed','primary product mismatch');
  ok(a.query.status==='aligned','drive-bed','query should align');
  ok(!a.facts.some(x=>/伸縮/.test(x.text)),'drive-bed','accessory lead must not become product fact');
}

{
  const a=analyze('portable-power','ポータブル電源','EcoFlow ポータブル電源 ソーラーパネル セット 1024Wh 軽量両面ソーラーパネル');
  ok(a.primaryProduct?.text==='ポータブル電源','portable-power','primary product mismatch');
  ok(a.facts.some(x=>x.text==='1024Wh'),'portable-power','capacity missing');
  ok(!a.facts.some(x=>/両面/.test(x.text)),'portable-power','panel feature leaked to main product');
}

{
  const a=analyze('powerbank-case','','GOPPA モバイルバッテリー用燃えにくいケース グリーン GP-FR18S/GR');
  ok(/ケース/.test(a.primaryProduct?.text||''),'powerbank-case','case must be the primary product');
  ok(!/^モバイルバッテリー$/.test(a.primaryProduct?.text||''),'powerbank-case','contained device became primary');
}

{
  const a=analyze('powerbank-pouch','','PowerBank ポーチ 収納 保護 カバー');
  ok(/ポーチ/.test(a.primaryProduct?.text||''),'powerbank-pouch','pouch must be primary');
}

{
  const a=analyze('query-mismatch','ドライブベッド','電動モップ コードレス 網戸掃除 充電式');
  ok(a.query.status==='mismatch','query-mismatch','mismatch not detected');
  ok(a.recommendation.shadowDecision==='fallback','query-mismatch','mismatch must fallback');
}

{
  const a=analyze('query-family','電動モップ','回転モップクリーナー 電動モップ コードレス 網戸 充電式');
  ok(a.query.status==='aligned','query-family','same-family title nouns should align');
  ok(a.query.canPromote===false,'query-family','query must never promote');
  ok(a.recommendation.shadowDecision==='fact_only_shadow','query-family','same-family item should remain shadow fact-only');
}

{
  const a=analyze('storage-bench','収納ベンチ','収納ベンチ 2人掛け 幅120 奥行37 高さ40cm ベンチボックス');
  ok(a.primaryProduct?.text==='収納ベンチ','storage-bench','storage bench primary mismatch');
}

{
  const a=analyze('laundry-basket','折りたたみランドリーバスケット','ランドリーバスケット 洗濯かご 折りたたみランドリーバスケット');
  ok(a.query.status==='aligned','laundry-basket','laundry family should align');
}

{
  const a=analyze('accessory-scope','スマートフォン','スマートフォン 防水ケース付き USB-Cケーブル付属 128GB');
  ok(a.recommendation.shadowDecision==='fallback','accessory-scope','unresolved primary/query disagreement must fallback');
  ok(!a.facts.some(x=>x.text==='防水'||/USB-C/i.test(x.text)),'accessory-scope','accessory feature leaked into facts');
}

{
  const a=analyze('comma-spec','','モバイルバッテリー 10,000mAh 30W USB-Cストラップケーブル付');
  ok(a.facts.some(x=>x.text==='10,000mAh'),'comma-spec','comma capacity not captured whole');
  ok(!a.facts.some(x=>x.text==='000mAh'),'comma-spec','partial numeric span captured');
}

if(failures){
  console.error('Shadow V2 failures:',failures);
  process.exit(1);
}
console.log('Shadow V2 regression: PASS');
