'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {localZeroCall,resolveIdentityHint}=require('../api/room-ai-v3');
const {composeLocalPartnerCopy}=require('../lib/local-partner-reasoner');

function assertLocalReady(item,label){
  const identity=resolveIdentityHint(item);
  assert.ok(identity,label+' should resolve a safe local identity');
  const partner=composeLocalPartnerCopy({itemName:item.itemName,itemCaption:item.itemCaption,identity,itemPrice:item.itemPrice});
  assert.ok(partner,label+' should resolve a grounded local purchase reason');
  const result=localZeroCall(item);
  assert.ok(result,label+' should complete locally');
  assert.equal(result.groq.totalCalls,0,label+' should use zero Groq calls');
  assert.equal(result.quality.status,'ready',label+' should be ready');
  assert.doesNotMatch(result.quality.text,/商品情報商品名|関連キーワード|^\s*\d+[.．]\s/m,label+' must not expose raw commerce metadata or numbered source prose');
  assert.doesNotMatch(result.quality.text,/^洗濯ネット\s*\n6枚セットです。/m,label+' must not publish count-only copy');
  assert.doesNotMatch(result.quality.text,/洗える洗濯ネットです。/m,label+' must not publish washable-only copy');
  assert.doesNotMatch(result.quality.text,/\d+cm(?:×\d+cm)+表記の洗濯ネットです。/m,label+' must not publish size-only copy');
  return result;
}

test('live washing-net rank2 no longer emits metadata sludge',()=>{
  const r=assertLocalReady({
    itemCode:'live:washing-net:2',
    itemName:'【正規品★セール中1480円→1380円★1年保証】 ブラジャー ネット ブラ 洗濯ネット 型崩れ防止 ドラム式 乾燥機対応 大きいサイズ ランドリーネット ランジェリー 下着 透けない 目隠し 厚手 形崩れ しない おすすめ 入れ方 gカップ 1枚用 ボール シリコン ok 洗濯機 旅行 3D',
    itemCaption:'商品情報商品名ブラジャーネット内容量 選べる 2色 ブルー ホワイト 商品説明 ・型崩れ無し！！・手洗いからの解放・汚れをしっかり落とす・ドラム式OK！！・頑丈なつくり・シリコン板が手洗いを実現！ 関連キーワード 洗濯ネット 下着 ランジェリー ブラジャー ネット 型崩れ 形 型 くずれ 崩れ 防止 対策 旅行 帰省 トラベル ワイヤー 頑丈 丈夫 手洗い不要 手洗い 縦型 ドラム式 大きめ',
    itemPrice:1380
  },'rank2');
  assert.match(r.quality.text,/型崩れ防止|乾燥機対応|ドラム式/);
});

test('live washing-net rank3 completes from direct caption evidence',()=>{
  const r=assertLocalReady({
    itemCode:'live:washing-net:3',
    itemName:'送料無料 洗濯ネット ふくらむ洗濯ネット特大70｜新生活 応援 洗濯ネット 大型 洗濯用 ネット 大容量 布団 毛布 寝具用 大きい コンパクト 大掃除 タオルケット 70cm ドラム式 便利グッズ まとめ洗い お買い物マラソン ランドリーネット',
    itemCaption:'【本体サイズ】 たたんだ時の寸法：横約140mm×縦約800mm、広げた時の寸法：内径約700mm 【材質】 ポリエステル 【質量】 約122g 【対応洗濯機】 全自動・ドラム式対応。※乾燥機能対応。 【商品説明】 ●シングルサイズの布団が入る大容量サイズです。●口が大きく開くので寝具等の大物でも出し入れがしやすいロングファスナーを使用しています。●洗濯機への出し入れがしやすく、持ち運びにも便利な持ち手付',
    itemPrice:1680
  },'rank3');
  assert.match(r.quality.text,/シングルサイズの布団|ロングファスナー|出し入れ/);
});

test('live washing-net rank4 uses grounded title protection signals instead of raw numbered prose',()=>{
  const r=assertLocalReady({
    itemCode:'live:washing-net:4',
    itemName:'洗濯ネット 8枚セット ランドリーネット 洗濯網 ドラム式 対応 大型 大きめ 大きいサイズ 丈夫 細かい網目 ファスナーカバー付き 絡まり防止 形崩れ防止 色移り防止 毛玉防止 シワ防止 ワイシャツ スーツ 下着 靴下 タオル まとめ買い 洗濯用品 旅行 トラベルポーチ',
    itemCaption:'商品説明 あらゆる衣類に対応可能なランドリーネット(洗濯ネット)です。 それぞれ形の8枚セットなので、大変お得！ 1. 洗濯物の絡まりを防ぐ。 2. 他の衣類を傷つけない ファスナーのついた服を洗濯ネットに入れずに洗濯すると他の衣類に引っ掛かる心配があります。',
    itemPrice:1000
  },'rank4');
  assert.match(r.quality.text,/形崩れ防止|絡まり防止|ファスナーカバー付き|色移り防止|毛玉防止|シワ防止/);
});

test('live washing-net rank5 does not collapse to washable-only copy',()=>{
  const r=assertLocalReady({
    itemCode:'live:washing-net:5',
    itemName:'★10/10まで100円OFF+P5倍 送料無料★【ブラ 洗濯ネット 型崩れ 防止】サボるん ブラジャー 洗濯 ネット 型 崩れ しない ドラム式 洗濯機 たたき洗い 手洗い おしゃれ着 ランジェリー メッシュ ホームクリーニング かわいい ハート ブラジャー用 洗濯機で洗える',
    itemCaption:'ブラジャー専用洗濯ネットです。ブラジャーのカップを裏返したり畳んだりせずに入れられるハート型により、左右のカップを包み込み洗濯時の擦れやねじれをおさえます。厚さ約3mmの目が細かい一枚生地が糸クズの侵入をおさえながら洗濯時の衝撃を吸収します。',
    itemPrice:1199
  },'rank5');
  assert.match(r.quality.text,/型崩れ\s*防止|擦れ|ねじれ|衝撃|ブラジャー/);
});

test('live washing-net rank6 uses structure reason instead of size-only copy',()=>{
  const r=assertLocalReady({
    itemCode:'live:washing-net:6',
    itemName:'P2倍 洗濯ネット 【楽天1位】 布団 毛布用 日本メーカー監修 特大サイズ 110cm×90cm 布団 毛布用 大型 角型 ランドリーネット ファスナー収納付き 全開ファスナー 出し入れ簡単 こたつ布団 敷きパッド ポイント消化 買い回り 送料無料',
    itemCaption:'特大サイズ110cm×90cm。大型洗濯の場合にファスナー部分が開こうとするため、ファスナー収納付き。全開ファスナーで出し入れしやすい仕様です。',
    itemPrice:700
  },'rank6');
  assert.match(r.quality.text,/ファスナー収納付き|全開ファスナー/);
});

test('live washing-net rank7 can stay local on explicit double-structure evidence',()=>{
  const r=assertLocalReady({
    itemCode:'live:washing-net:7',
    itemName:'【楽天デイリー1位】【Makuake公式】 WASHING LOCK 洗濯ネット 魔法の洗濯ネット 型崩れ防止 ニット 衣類 洗濯 洗濯機対応 便利グッズ おしゃれ着 セーター ダウン ジャケット クリーニング ウォッシングロック 二重構造 Makuake マクアケ',
    itemCaption:'二重構造ネットが衣類の形を維持＆保護する洗濯ネットです。二重ネットが衣類の形を維持し、型崩れや伸びを抑えます。',
    itemPrice:4980
  },'rank7');
  assert.match(r.quality.text,/二重構造|型崩れ防止/);
});

test('live washing-net rank8 does not publish pack-count-only copy',()=>{
  const r=assertLocalReady({
    itemCode:'live:washing-net:8',
    itemName:'【 楽天1位受賞★レビュー特典付き 】＼クーポンで最大20％OFF！／洗濯ネット ランドリーネット 大型 ニット 6枚セット 下着 形崩れ防止 洗濯用品 家庭用品 トラベルポーチ 収納ネット RP1',
    itemCaption:'',
    itemPrice:1000
  },'rank8');
  assert.match(r.quality.text,/形崩れ防止/);
});



test('live washing-net rank9 completes locally from direct capacity evidence',()=>{
  const r=assertLocalReady({
    itemCode:'live:washing-net:9',
    itemName:'★楽天1位★ 洗濯ネット 特大 布団 布団用 毛布 ランドリー ネット バッグ 洗濯 洗濯袋 ダイヤ ランドリーバック 大型 毛布 羽毛 こたつ布団 敷パッド カーテン ぬいぐるみ 特大サイズ 大きい カーペット 寝具 冬服 マット まとめ 丸洗い',
    itemCaption:'商品名 洗濯ネット 特大 布団用 大 ランドリー ネット バッグ 洗濯袋。細目網は傷みやすい生地やデリケートな衣類に適しており、引っかかりやほつれを防ぎます。粗目網は布団や毛布など比較的丈夫な衣類の洗濯に適しています。【特大サイズ】110cm×90cmという特大サイズの洗濯ネットは、布団やカーテン、毛布やたくさんの衣類を包み込むことができます。',
    itemPrice:1780
  },'rank9');
  assert.match(r.quality.text,/110cm×90cm|布団|毛布|包み込む|引っかかり|ほつれ/);
});

test('live washing-net rank10 can complete locally from explicit deformation-prevention title fact',()=>{
  const r=assertLocalReady({
    itemCode:'live:washing-net:10',
    itemName:'【マラソン期間P2倍!】【楽天1位】洗濯ネット サイズ組み合わせ自由 選べる6枚セット ランドリーネット 洗濯 ネット 角型 洗濯用品 型崩れ防止 丈夫 細かい 網目 トラベル 使いやすい ランドリー 小 送料無料',
    itemCaption:'洗濯時の型崩れ防止や衣類のダメージを軽減するための洗濯ネットです。丈夫で細かい網目のデザインが特徴です。',
    itemPrice:1000
  },'rank10');
  assert.match(r.quality.text,/型崩れ防止/);
});
