# Groq制限対応の確認記録

変更理由はGroq使用制限への安全対応のみ。PR #159はDraft維持。main、Production、決済、モデル、上限、プランは変更しない。

## 初期状態

GitHub HEAD: 5f7e7691c570e16ed9b6e3bb3f7e8f9b34038fe2。
PR #159: open / draft / merged=false。
Deployment dpl_353oHkREfp8uC1UpvnjzPmtKvBfe: READY、target=null、同じSHA。
復元基準ba53847d1ab7173096e871560ba1fdce97c5057cとの差は.vercel-preview-triggerのみ。
今回のブラウザはログイン画面。以前のownerセッションは利用できなかった。

## 現在の通信経路

- Preview通常画面: api/room-ai-v3.js:createHandler -> super-urenavi-v3-engine.js:analyzeProductV3 -> super-urenavi-v3-groq.js:callStructured。ローカルまたは安全なverified identity再利用成功は0通信。完成商品キャッシュも0。新規生成は1、既存条件で検証が必要なら追加1。部分キャッシュの検証は1。429を受けると後続検証へ進まない。APIでdeferPass2=false。statusOnlyは通信0。
- /api/room-ai: type-wrapper -> router -> legacy.defaultCallGroq。有効またはnegativeの商品キャッシュ、ローカル成功なら商品分析0。必要時に文字分析、さらに必要時に画像分析の2段階。修正前は各段階最大4通信(429再試行込み)。修正後は429で即時終了。既存400 JSON構造再試行1回は維持するため各段階最大2通信。
- type-wrapperは商品種別知識が未登録の場合に追加最大1通信を行う。これは商品キャッシュやローカル成功でも発生しうる既存仕様。有効/無効の知識キャッシュ、生成条件不成立等では0。採用条件は変更しない。429は200成功応答へ混ぜず429として返す。
- room-semantic-engine.js / room-semantic-provider.js: product/sentences生成・全文検証の別エンジン。通常最大4通信、完成キャッシュは0、inflight重複防止あり。429待機化処理が残るが、現在のAPIから未接続。今回変更・接続しない。
- V3および旧routerは同時に届いた別HTTPリクエストの処理全体を共有しない。複数リクエスト/複数インスタンスでキャッシュ未生成時の重複の可能性は残る。今回、同時リクエスト対策完了とは判定しない。
- public/room-preview-request.jsは202かつpending=trueのときのみ続行。429は待機も再試行もせず返る。app.htmlは429後、同じユーザー操作内の残り商品を停止する。新しい操作での呼び出し条件は変更しない。

## 変更

429の自動再試行を撤去、retry-afterは記録・表示のみ、上流429をAPIの429失敗へ伝達、ok=false/pending=false、知識生成の429通信を0回としない、画面の残り商品停止を両経路に適用。

商品理解、購入価値判断、文章生成、品質基準、各プロンプト/スキーマ、機械判定、AI検証、Groqが必要になる意味上の条件、verified identityおよびキャッシュの採用仕様は変更なし。

## 検証

修正前/修正後ともnpm run vercel-build成功。
node --test tests/groq-rate-limit-safety.test.js tests/v3-learned-identity-reuse.test.js: 9/9成功。
追加5テストはモック通信。3通信実装それぞれでretry-after=0および614秒の429を1通信で終了。Previewクライアントの待機0、再試行0、失敗状態、画像段階未実行、知識429の失敗伝達、両画面経路で残り商品停止を確認。既存4テストでverified identityの安全な再利用時にAI分析0を確認。
既存商品種別知識・wrapperテストを含む再利用関連テストも成功。
git diff --check成功。

実Groq通信: 未検証。指定8商品それぞれの実通信回数: 未検証。実429の画面挙動: 未検証。文章品質: 品質未検証。理由は現在のブラウザにowner認証がないため。今回の過去の429記録を新しい実測PASSとして使わない。

## 範囲外問題の記録

引継ぎで提示された本体生成文とgeneratedCopyの差、旧ロジックの作り直し、定型文、付属品特徴の本体への移動、刺さり不足、商品理解、対象/部位/条件/否定/程度の品質、5件+横断3件の最終品質検証は未修正。
例: 伸縮リード付きドライブベッドを伸縮タイプのドライブベッドとする問題は今回再実測していない。

復元コードのGroq writerはproductType/appealsを出力し、内部attributeRefsへ変換する。合意済みproduct(what/acts_on/acts_on_quote), sentences(text/kinds/quotes)契約と一致しない。合意スキーマを持つ別エンジンは未接続。差異は報告のみ。今回契約統一・検証方式変更は行わない。

## 判定

ローカルのモック検証と既存検証は成功。実通信を含めたGroq制限対応の最終完了判定は保留。文章品質完成、merge可とは判定しない。PR #159 Draft維持。
