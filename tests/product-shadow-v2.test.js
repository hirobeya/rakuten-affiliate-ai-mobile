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


{
  const tuningCases=[
    ['tune-humidifier','加湿器','超音波 加湿器 4L 上から給水 静音 LEDライト','加湿器'],
    ['tune-kettle','電気ケトル','電気ケトル 1.0L 温度調節 保温 コンパクト','電気ケトル'],
    ['tune-usb-hub','USBハブ','USBハブ Type-C 7in1 HDMI PD対応 SDカード','USBハブ'],
    ['tune-umbrella','折りたたみ傘','折りたたみ傘 軽量 晴雨兼用 自動開閉 コンパクト','折りたたみ傘'],
    ['tune-pet-water','ペット給水器','ペット給水器 犬 猫 自動給水器 2L USB給電','ペット給水器'],
    ['tune-storage-wagon','収納ワゴン','収納ワゴン 3段 キャスター付き スリム キッチン','収納ワゴン'],
    ['tune-pan','フライパン','フライパン 26cm IH ガス火対応 食洗機対応','フライパン'],
    ['tune-bottle','水筒','水筒 500ml 保温 保冷 ステンレス ボトル','水筒'],
    ['tune-pillow','枕','枕 洗える 高さ調整 横向き 寝返り','枕'],
    ['tune-board','まな板','まな板 食洗機対応 軽量 日本製','まな板'],
    ['tune-laundry-basket','ランドリーバスケット','ランドリーバスケット 洗濯かご 折りたたみ メッシュ','ランドリーバスケット'],
    ['tune-kitchen-wagon','キッチンワゴン','キッチンワゴン 3段 キャスター付き スリム','キッチンワゴン'],
    ['tune-mobile-battery','モバイルバッテリー','モバイルバッテリー 10000mAh 30W USB-C ケーブル内蔵','モバイルバッテリー'],
    ['tune-portable-power','ポータブル電源','ポータブル電源 1024Wh 1500W ソーラーパネルセット','ポータブル電源'],
    ['tune-dog-bed','犬用ベッド','犬用ベッド 洗える 防水 Lサイズ 滑り止め','犬用ベッド']
  ];
  for(const [id,query,itemName,primary] of tuningCases){
    const a=analyze(id,query,itemName);
    ok(a.primaryProduct?.text===primary,id,'primary mismatch: '+JSON.stringify(a.primaryProduct));
    ok(a.query.status==='aligned',id,'query must align');
    ok(a.recommendation.shadowDecision==='fact_only_shadow',id,'must stay fact-only shadow');
  }
}


{
  const finalTuning=[
    ['tune-tshirt','Tシャツ','Tシャツ メンズ 綿100% 半袖','Tシャツ'],
    ['tune-seat-cover','シートカバー','車 シートカバー 防水 後部座席 ペット','シートカバー'],
    ['tune-laptop-stand','ノートPCスタンド','ノートPCスタンド 折りたたみ アルミ 高さ調整','ノートPCスタンド'],
    ['tune-rug','ラグ','ラグ 185×185cm 洗える 滑り止め','ラグ'],
    ['tune-storage-basket','収納バスケット','収納バスケット 折りたたみ 布製 Lサイズ','収納バスケット'],
    ['tune-eco-bag','エコバッグ','エコバッグ 折りたたみ 撥水 コンパクト','エコバッグ'],
    ['tune-floor-mat','フロアマット','車用 フロアマット 防水 滑り止め','フロアマット'],
    ['tune-phone-stand','スマホスタンド','スマホスタンド 折りたたみ 卓上 角度調整','スマホスタンド'],
    ['tune-tissue-case','ティッシュケース','ティッシュケース 壁掛け 防水','ティッシュケース'],
    ['tune-laundry-rack','ランドリーラック','ランドリーラック 洗濯機上 収納 棚','ランドリーラック']
  ];
  for(const [id,query,itemName,primary] of finalTuning){
    const a=analyze(id,query,itemName);
    ok(a.primaryProduct?.text===primary,id,'primary mismatch: '+JSON.stringify(a.primaryProduct));
    ok(a.query.status==='aligned',id,'query must align');
    ok(a.recommendation.shadowDecision==='fact_only_shadow',id,'must stay fact-only shadow');
  }
}

if(failures){
  console.error('Shadow V2 failures:',failures);
  process.exit(1);
}
console.log('Shadow V2 regression: PASS');
