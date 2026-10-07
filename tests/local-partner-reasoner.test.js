'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {chooseAngle,composeLocalPartnerCopy,explicitStepAdjustment}=require('../lib/local-partner-reasoner');
const {candidateFromFact,resolveCompetingHypotheses,composeGenericLocalCopy,semanticProfile,safeTitleFacts,composeGenericFromTitle,safeCaptionCandidates,composeGenericFromSources}=require('../lib/local-generic-reasoner');

test('electric kettle combines product scene and capacity choice without inventing speed',()=>{
  const title='T-fal ティファール ジャスティンロック 1.2L KO5901JP 電気ケトル 転倒湯こぼれ防止 1200ml';
  const out=composeLocalPartnerCopy({itemName:title,identity:'電気ケトル',itemPrice:3759});
  assert.ok(out);
  assert.equal(out.quote,'1.2L');
  assert.match(out.text,/飲み物や調理用のお湯を沸かしたいとき、容量も見て選ぶなら/);
  assert.match(out.text,/1\.2L容量の電気ケトル/);
  assert.doesNotMatch(out.text,/速|スピード|すぐ沸/);
  assert.equal(out.generic,false);
  assert.equal(out.hookType,'product_scene');
});


test('known folding signal avoids repeating folding already inside product identity',()=>{
  const out=composeLocalPartnerCopy({itemName:'日傘 折りたたみ 折りたたみ傘',identity:'折りたたみ傘'});
  assert.ok(out);
  assert.match(out.text,/折りたたみ傘です/);
  assert.doesNotMatch(out.text,/折りたたみ仕様の折りたたみ傘/);
});

test('mobile battery combines real product scene with capacity choice and never invents charge count',()=>{
  const title='モバイルバッテリー 23600mAh USB-C ブラック';
  const out=composeLocalPartnerCopy({itemName:title,identity:'モバイルバッテリー'});
  assert.ok(out);
  assert.equal(out.quote,'23600mAh');
  assert.match(out.text,/外出先で機器を充電したいとき、容量も見て選ぶなら/);
  assert.match(out.text,/23600mAh容量のモバイルバッテリー/);
  assert.doesNotMatch(out.text,/\d+回充電|何回|フル充電|急速/);
});

test('motorcycle glove preserves parked smartphone safety intent over generic riding scene',()=>{
  const title='バイクグローブ 夏用 メッシュ ライディンググローブ スマホ対応 バイク 手袋';
  const out=composeLocalPartnerCopy({itemName:title,identity:'バイクグローブ'});
  assert.ok(out);
  assert.equal(out.quote,'スマホ対応');
  assert.match(out.text,/停車中/);
  assert.doesNotMatch(out.text,/走行中|運転中/);
  assert.equal(out.generic,false);
  assert.equal(out.hookType,'scene');
});

test('component weight such as 5g propeller is not promoted into a product benefit',()=>{
  const title='自動給餌器 スマホ操作 カメラ付き 5gプロペラ付き 猫 犬';
  assert.equal(chooseAngle(title,'自動給餌器'),null);
  assert.equal(composeLocalPartnerCopy({itemName:title,identity:'自動給餌器'}),null);
});

test('generic glove has no active partner knowledge and cannot guess the use',()=>{
  const title='グローブ 手袋 ブラック 男女兼用';
  assert.equal(composeLocalPartnerCopy({itemName:title,identity:'グローブ'}),null);
});

test('resolved storage bench never borrows storage-box knowledge and a bare unlabeled size may defer',()=>{
  const title='鍵穴付き コンテナボックス アルミベンチ 屋外 収納 ベンチ 90cm 収納ボックス 工具箱';
  const out=composeLocalPartnerCopy({itemName:title,identity:'収納ベンチ'});
  if(out){
    assert.equal(out.productType,'収納ベンチ');
    assert.match(out.text,/収納ベンチ/);
    assert.doesNotMatch(out.text,/収納ボックスです/);
    assert.doesNotMatch(out.text,/座る場所と収納を一緒/);
  }
});

test('unknown exact identity can turn a literal structural fact into a safe purchase axis',()=>{
  const title='包丁スタンド ステンレス 食洗機対応 日本製';
  const out=composeLocalPartnerCopy({itemName:title,identity:'包丁スタンド'});
  assert.ok(out);
  assert.equal(out.generic,true);
  assert.equal(out.quote,'食洗機対応');
  assert.match(out.text,/食洗機対応で選びたいなら/);
  assert.match(out.text,/食洗機対応の包丁スタンド/);
});

test('bare gram value defers when its semantic role is not proven',()=>{
  const title='キッチンスケール 0.1g デジタル 計量器';
  const out=composeLocalPartnerCopy({itemName:title,identity:'キッチンスケール'});
  assert.equal(out,null);
});

test('unknown exact identity combines explicit extendable structure with exact range naturally',()=>{
  const title='自撮り棒 伸縮式 三脚一体型 最大130cm ブラック';
  const out=composeLocalPartnerCopy({itemName:title,identity:'自撮り棒'});
  assert.ok(out);
  assert.equal(out.generic,true);
  assert.equal(out.quote,'伸縮式');
  assert.equal(out.supportQuote,'最大130cm');
  assert.match(out.text,/長さを変えて使いたいなら/);
  assert.match(out.text,/伸縮式で、最大130cm表記の自撮り棒/);
  assert.doesNotMatch(out.text,/集合写真|遠くから|映える|撮影が楽|撮りやす/);
  assert.equal(out.decision.meaningBundle.family,'adjustability');
  assert.equal(out.decision.meaningBundle.evidenceCount,2);
  assert.equal(out.decision.hypothesisStatus,'clear');
});

test('explicit height adjustment becomes a natural generic decision axis without inventing comfort',()=>{
  const title='ノートPCスタンド 高さ調整 アルミ 折りたたみ';
  const out=composeLocalPartnerCopy({itemName:title,identity:'ノートPCスタンド'});
  assert.ok(out);
  assert.equal(out.quote,'高さ調整');
  assert.match(out.text,/高さを変えて使いたいなら/);
  assert.doesNotMatch(out.text,/姿勢|疲れ|快適|肩こり/);
});

test('remote feature remains a choice axis and never invents a usage outcome',()=>{
  const title='LEDライト リモコン付き 角度調整 USB-C';
  const out=composeLocalPartnerCopy({itemName:title,identity:'LEDライト'});
  assert.ok(out);
  assert.match(out.text,/角度を変えて使いたいなら|操作方法まで見て選ぶなら/);
  assert.doesNotMatch(out.text,/離れた場所から簡単|手元で楽々|便利/);
});

test('negated or excluded purchase feature is never promoted and weak material alone defers',()=>{
  const title='タブレットスタンド 高さ調整非対応 リモコン別売 アルミ';
  const out=composeLocalPartnerCopy({itemName:title,identity:'タブレットスタンド'});
  assert.equal(out,null);
});

test('standalone material, washable wording, and pack count do not complete a purchase-reason post',()=>{
  assert.equal(composeLocalPartnerCopy({itemName:'洗濯ネット シリコン',identity:'洗濯ネット'}),null);
  assert.equal(composeLocalPartnerCopy({itemName:'洗濯ネット 洗える',identity:'洗濯ネット'}),null);
  assert.equal(composeLocalPartnerCopy({itemName:'洗濯ネット 8枚セット',identity:'洗濯ネット'}),null);
});

test('family hypotheses compare different meanings instead of only individual facts',()=>{
  const identity='自撮り棒';
  const source='自撮り棒 伸縮式 最大130cm 三脚一体型 Bluetooth';
  const facts=['伸縮式','最大130cm','三脚一体型','Bluetooth'].map(quote=>({quote}));
  const candidates=facts.map(f=>candidateFromFact(f,identity)).filter(Boolean);
  const result=resolveCompetingHypotheses(candidates,{source,identity});
  assert.equal(result.status,'clear');
  assert.equal(result.winner.family,'adjustability');
  assert.equal(result.winner.supportCount,2);
  assert.ok(result.hypotheses.some(x=>x.family==='installation'));
  assert.ok(result.hypotheses.some(x=>x.family==='control'));
});

test('near-tied different meaning families defer when neither has stronger evidence',()=>{
  const identity='テストスタンド';
  const source='テストスタンド リモコン付き 三脚一体型';
  const candidates=[
    {quote:'リモコン付き',axis:'操作方法',hook:'操作方法まで見て選ぶなら',body:'リモコン付きのテストスタンドです。',score:10,kind:'signal'},
    {quote:'三脚一体型',axis:'設置・構造',hook:'置き方や設置方法まで見て選ぶなら',body:'三脚一体型のテストスタンドです。',score:10,kind:'signal'}
  ];
  const result=resolveCompetingHypotheses(candidates,{source,identity});
  assert.equal(result.status,'close');
  assert.ok(result.margin<2);
  const out=composeGenericLocalCopy({identity,facts:[{quote:'リモコン付き'},{quote:'三脚一体型'}],itemName:source});
  assert.equal(out,null);
});

test('folding wording avoids repeating a feature already present in product identity',()=>{
  const candidate=candidateFromFact({quote:'折りたたみ'},'折りたたみチェア');
  assert.ok(candidate);
  assert.equal(candidate.body,'折りたたみチェアです。');
  assert.doesNotMatch(candidate.body,/折りたたみ仕様の折りたたみ/);
});

test('material wording uses natural Japanese grammar without changing evidence',()=>{
  assert.equal(candidateFromFact({quote:'木製'},'女優サロンブラシ').body,'木製の女優サロンブラシです。');
  assert.equal(candidateFromFact({quote:'ステンレス'},'包丁スタンド').body,'ステンレス製の包丁スタンドです。');
  assert.equal(candidateFromFact({quote:'メッシュ'},'チェアベルト').body,'メッシュ素材のチェアベルトです。');
  assert.equal(candidateFromFact({quote:'本革'},'バイクグローブ').body,'本革を使ったバイクグローブです。');
});

test('extendable wording avoids awkward double specification while preserving exact feature',()=>{
  const candidate=candidateFromFact({quote:'伸縮式'},'自撮り棒');
  assert.ok(candidate);
  assert.equal(candidate.body,'伸縮式の自撮り棒です。');
  const embedded=candidateFromFact({quote:'伸縮'},'伸縮ラック');
  assert.equal(embedded.body,'伸縮ラックです。');
});

test('explicit capacity label gives an unknown product a safe semantic axis without exaggeration',()=>{
  const source='保存コンテナ 容量 10L 透明';
  const out=composeGenericLocalCopy({identity:'保存コンテナ',facts:[{quote:'容量 10L'}],itemName:source});
  assert.ok(out);
  assert.equal(out.axis,'容量');
  assert.match(out.text,/容量まで見て選ぶなら/);
  assert.match(out.text,/容量 10L表記の保存コンテナ/);
  assert.doesNotMatch(out.text,/大容量|たっぷり|たくさん入る/);
});

test('explicit dimension label gives semantic size meaning but no use-case claim',()=>{
  const source='折りたたみ踏み台 高さ 39cm アルミ';
  const out=composeGenericLocalCopy({identity:'折りたたみ踏み台',facts:[{quote:'高さ 39cm'}],itemName:source});
  assert.ok(out);
  assert.equal(out.axis,'サイズ');
  assert.match(out.text,/サイズまで見て選ぶなら/);
  assert.doesNotMatch(out.text,/高い所|届きやす|乗りやす|安全/);
});

test('size-only generic copy remains semantic but cannot finish the local publish path',()=>{
  const semantic=composeGenericLocalCopy({identity:'収納ケース',facts:[{quote:'高さ 37cm',source:'itemName'}],itemName:'収納ケース 高さ 37cm'});
  assert.ok(semantic);
  assert.equal(semantic.axis,'サイズ');
  assert.equal(composeLocalPartnerCopy({itemName:'収納ケース 高さ 37cm',identity:'収納ケース'}),null);
});

test('explicit weight label is understood as weight but never turned into portability',()=>{
  const source='測定器 重量 1.2kg ブラック';
  const out=composeGenericLocalCopy({identity:'測定器',facts:[{quote:'重量 1.2kg'}],itemName:source});
  assert.ok(out);
  assert.equal(out.axis,'重量');
  assert.match(out.text,/重さまで見て選ぶなら/);
  assert.doesNotMatch(out.text,/軽い|軽量|持ち運び|携帯/);
});

test('semantic profile records dominant meaning and evidence breadth for unknown products',()=>{
  const identity='テストライト';
  const source='テストライト 角度調整 リモコン付き USB-C';
  const candidates=['角度調整','リモコン付き','USB-C'].map(quote=>candidateFromFact({quote},identity)).filter(Boolean);
  const profile=semanticProfile(candidates,{source,identity});
  assert.equal(profile.status,'clear');
  assert.equal(profile.dominantFamily,'adjustability');
  assert.ok(profile.secondaryFamilies.includes('control'));
  assert.equal(profile.evidenceCount,3);
  assert.ok(profile.breadth>=2);
});

test('standalone battery-powered wording alone does not finish local copy',()=>{
  assert.equal(
    composeLocalPartnerCopy({itemName:'センサーライト 電池式',identity:'センサーライト'}),
    null
  );
});

test('standalone rechargeable wording alone does not finish generic local copy',()=>{
  const title='卓上クリーナー 充電式 消しゴム USB デスク掃除機 ミニクリーナー';
  const facts=safeTitleFacts(title);
  assert.ok(facts.some(x=>x.quote==='充電式'));
  assert.equal(composeGenericFromTitle({itemName:title,identity:'卓上クリーナー'}),null);
});

test('rechargeable wording attached to an accessory is not promoted to whole-product power source',()=>{
  const title='卓上クリーナー 充電式バッテリー付属 デスク掃除機';
  const facts=safeTitleFacts(title);
  assert.ok(!facts.some(x=>x.quote==='充電式'));
});


test('standalone connector and caster restatements do not finish generic local copy',()=>{
  assert.equal(composeGenericFromTitle({itemName:'ハンディファン Type-C',identity:'ハンディファン'}),null);
  assert.equal(composeGenericFromTitle({itemName:'シューズラック キャスター付き',identity:'シューズラック'}),null);
});

test('meaningful generic operators remain available',()=>{
  const folding=composeGenericFromTitle({itemName:'パソコンスタンド 折りたたみ',identity:'パソコンスタンド'});
  assert.ok(folding);
  assert.equal(folding.axis,'収納形態');
  const dishwasher=composeGenericFromTitle({itemName:'包丁スタンド 食洗機対応',identity:'包丁スタンド'});
  assert.ok(dishwasher);
  assert.equal(dishwasher.axis,'お手入れ');
});


test('step adjustment requires an explicit adjustment target before local completion',()=>{
  assert.equal(explicitStepAdjustment('自動泡ソープディスペンサー 充電式 300ml 3段階調節 防水','自動泡ソープディスペンサー'),null);

  const targeted=explicitStepAdjustment('卓上ファン 風量3段階調節 USB','卓上ファン');
  assert.ok(targeted);
  assert.equal(targeted.quote,'風量3段階調節');
  assert.match(targeted.text,/風量3段階調節/);
});


test('weak bare environmental fact cannot borrow unrelated numeric support',()=>{
  const out=composeGenericFromTitle({
    itemName:'自動泡ソープディスペンサー 充電式 300ml 防水',
    identity:'自動泡ソープディスペンサー'
  });
  assert.equal(out,null);
});


test('rechargeable plus connector wording still does not finish without same-axis power support',()=>{
  assert.equal(
    composeGenericFromTitle({itemName:'電動ワインデキャンタ 充電式 Type-C',identity:'電動ワインデキャンタ'}),
    null
  );
});

test('rechargeable generic copy can finish when independently corroborated on the same power axis',()=>{
  const out=composeGenericLocalCopy({
    identity:'テスト機器',
    itemName:'テスト機器 充電式 USB給電',
    facts:[{quote:'充電式',source:'itemName'}],
    extraCandidates:[{
      quote:'USB給電',source:'itemName',axis:'電源方式',hook:'電源方式まで見て選ぶなら',
      body:'USB給電表記のテスト機器です。',score:9,kind:'signal'
    }]
  });
  assert.ok(out);
  assert.equal(out.axis,'電源方式');
  assert.match(out.text,/電源方式まで見て選ぶなら/);
});

test('caption-grounded generic reasoning works across unknown product types without category registration',()=>{
  const itemName='洗濯ネット ふくらむ洗濯ネット特大70 大容量 布団 毛布 70cm ドラム式';
  const itemCaption='【本体サイズ】内径約700mm。【商品説明】シングルサイズの布団が入る大容量サイズです。口が大きく開くので寝具等の大物でも出し入れがしやすいロングファスナーを使用しています。';
  const out=composeGenericFromSources({itemName,itemCaption,identity:'ふくらむ洗濯ネット特大70'});
  assert.ok(out);
  assert.equal(out.source,'itemCaption');
  assert.match(out.text,/ふくらむ洗濯ネット特大70/);
  assert.match(out.text,/シングルサイズの布団|出し入れがしやすいロングファスナー/);
});


test('caption capacity wording distinguishes storage amount from neutral product capacity',()=>{
  const power=composeGenericFromSources({
    itemName:'ポータブル電源 286Wh',
    itemCaption:'容量 286Wh。定格出力 600W。',
    identity:'ポータブル電源'
  });
  assert.ok(power);
  assert.match(power.text,/容量まで見て選ぶなら/);
  assert.doesNotMatch(power.text,/入る量や容量/);

  const storage=composeGenericFromSources({
    itemName:'洗濯ネット 大容量 布団用',
    itemCaption:'シングルサイズの布団が入る大容量サイズです。',
    identity:'洗濯ネット'
  });
  assert.ok(storage);
  assert.match(storage.text,/入る量や容量まで見て選ぶなら/);
});

test('caption-grounded reasoning rejects unrelated cross-sell text',()=>{
  const itemName='ブラジャー 洗濯ネット 型崩れ防止 ドラム式 乾燥機対応';
  const itemCaption='商品説明 ドラム式OK!! ブラジャーの型崩れを防ぐ洗濯ネットです。今、シール集めが大ブーム！あふれるコレクションをかわいく整理できる専用バインダーが登場しました！';
  const candidates=safeCaptionCandidates({itemName,itemCaption,identity:'洗濯ネット'});
  assert.ok(candidates.length>0);
  assert.ok(candidates.every(x=>!/シール|バインダー/.test(x.quote)));
  const out=composeGenericFromSources({itemName,itemCaption,identity:'洗濯ネット'});
  assert.ok(out);
  assert.doesNotMatch(out.text,/シール|バインダー/);
});

test('weak unrelated caption does not force local publication',()=>{
  const out=composeGenericFromSources({
    itemName:'洗濯ネット シリコン',
    itemCaption:'かわいいシールを整理する専用バインダーです。',
    identity:'洗濯ネット'
  });
  assert.equal(out,null);
});


test('noisy commerce metadata caption never becomes a ROOM purchase reason',()=>{
  const itemName='ブラジャー ネット ブラ 洗濯ネット 型崩れ防止 ドラム式 乾燥機対応 旅行';
  const itemCaption='商品情報商品名ブラジャーネット内容量 選べる 2色 ブルー ホワイト 商品説明 ・型崩れ無し!!・ドラム式OK!! 関連キーワード 洗濯ネット 下着';
  const out=composeGenericFromSources({itemName,itemCaption,identity:'洗濯ネット',itemPrice:1380});
  if(out) assert.doesNotMatch(out.text,/商品情報商品名|内容量 選べる|関連キーワード/);
});

test('numbered explanatory prose is not copied verbatim as a local purchase reason',()=>{
  const itemName='洗濯ネット 8枚セット 丈夫 細かい網目 絡まり防止 形崩れ防止';
  const itemCaption='2. 他の衣類を傷つけない ファスナーのついた服を洗濯ネットに入れずに洗濯すると、他の衣類に引っ掛かり傷つけてしまう心配があります。';
  const out=composeGenericFromSources({itemName,itemCaption,identity:'洗濯ネット',itemPrice:1000});
  if(out) assert.doesNotMatch(out.text,/^2[.．]|2\. 他の衣類/m);
});

test('raw washable, pack count, and unlabeled dimensions stay below local publication threshold',()=>{
  assert.equal(composeGenericFromSources({itemName:'洗濯ネット 洗える メッシュ',itemCaption:'',identity:'洗濯ネット'}),null);
  assert.equal(composeGenericFromSources({itemName:'洗濯ネット 6枚セット',itemCaption:'',identity:'洗濯ネット'}),null);
  assert.equal(composeGenericFromSources({itemName:'洗濯ネット 110cm×90cm',itemCaption:'',identity:'洗濯ネット'}),null);
});


test('exact protection and washer compatibility wording can become a grounded local reason',()=>{
  const out=composeLocalPartnerCopy({
    itemName:'洗濯ネット 8枚セット 型崩れ防止 ドラム式対応 ファスナーカバー付き',
    identity:'洗濯ネット',
    itemPrice:1000
  });
  assert.ok(out);
  assert.match(out.text,/型崩れ防止|ドラム式対応|ファスナーカバー付き/);
  assert.doesNotMatch(out.text,/洗えるタイプで選びたいなら/);
});
