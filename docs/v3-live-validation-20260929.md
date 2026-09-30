# ウレナビ — 検証・販売再開 gate（2026-10-01更新）

## 適用範囲とmerge先
PR #154の検証用merge先は `v3-live-validation-20260929`。
- 検証用ブランチへのmerge条件：gate 1（対象headのCI／Preview READY）＋PR本文・評価文書と現行実装の一致。
- mainへのmerge・Production反映・販売再開の条件：gate 0〜7すべて。
- gate 0未達の間は、gate 1〜7がすべて合格してもmain／Productionに反映しない。
- 検証用への統合は販売許可ではない。今回はDraft維持。merge・Ready化・main／Production操作は行わない。
- 達成証拠には対象SHA、日時、評価経路を記録する。コード変更後は影響するgateを再評価する。

## gate 0：前提条件（販売再開の必須条件）
以下は本プロジェクトの受入条件。文書への記載だけで達成済みにはしない。
- 楽天ウェブサービス規約 第10条1項(4)(7)(9)(10)等について、本サービスの利用形態に対する楽天の書面回答または許可を取得済み。
- ホスティングが無料枠で商用利用可能であることを確認済み。Vercel Hobbyのままでは不可。採用プランの商用利用条件・料金・証拠を記録する。
- Groq無料枠（特にOTPM 1,000）の予算内で想定利用量が成立することを実測で確認済み。採用モデル・アカウントの実際の制限、同時利用数、分／日ごとの負荷、画像経路と失敗・再試行も含める。
現状：書面回答／許可、ホスティング条件の確認証拠、想定利用量の成立を示す実測はこの文書に未提出。gate 0は未達。

## 現行実装と評価経路
- owner認証済みPreviewのみで評価する。
- 実画面と同じ `/api/room-ai` を使う。検索は `/api/search`。検索／ページ読込でGroqを呼ばないことを実測する。
- 通常画面の生成は `lib/room-post-generator-v1.js` のsingle-pass生成器。商品理解・事実・本文・タグを一度に生成し、サーバーで文単位の検査とタグの根拠検査を行う。
- 商品説明が120文字未満で画像URLがあれば画像を最初の呼出しで使う。テキストで理解できず、まだ画像を試していない場合だけ画像経路を追加する。通常APIのGroq呼出しは1回、条件付きで最大2回。
- 独立した価値検証段階は通常APIにない。商品理解ができなければ422、本文とタグを結合したcopyが空なら502。copyReady=trueやHTTP 200自体は品質gate通過を意味しない。
- 最終表示はサーバーの `_v3Copy` を使う。実商品原文と表示結果を照合する。

## gate 1〜7
1. 対象headのCI成功／Preview READY。
2. 評価集合で意味を変える事実誤り = 0。
3. 根拠のない顧客価値訴求 = 0。
4. 導入／本文が同一の汎用テンプレに収束していない。
5. 読後に具体的な購入理由を説明できる。単なるHTTP成功・事実列挙だけで合格にしない。
6. 以下の6a・6bをそれぞれ評価する。
   - 6a：Groq呼出し上限の制御。分単位上限はRetry-Afterまで待機し、日単位上限では実行を停止する。想定同時利用・画像・失敗・再試行も含む実リクエスト数とトークン量を確認する。
   - 6b：キャッシュ再利用。楽天の書面回答後に「全利用者共有／利用者単位／使わない」の方式を確定して評価する。回答前に共有キャッシュの読み出し・再利用は実装しない。「使わない」を選ぶ場合は読み出しなしを確認し、その前提でgate 0の予算を再評価する。保存内容・期間・アクセス範囲も回答に照らして確認する。
7. current headのowner認証済みPreviewで実商品・カテゴリ横断評価を完了する。対象商品原文・表示された生成文・gate 2〜5の人による判定・呼出し実測を提出する。

## pacing実装の確認（コード基準SHA）
基準SHA：`0aaa75e72dddcaa9c96e90e964231e36eb2f2ffd`。
`scripts/room-post-golden.js`：
- リクエスト間隔は固定待機を残している。既定10秒、設定範囲5〜120秒。
- 429は種類を区別せず再試行する。既定3回、設定最大5回。
- 数値のRetry-Afterがあれば、固定間隔と「Retry-After秒＋1秒」の大きい方だけ待機する。なければ固定間隔と15秒×試行番号の大きい方。
- 分単位／日単位の上限種別の判定はない。再試行を使い切っても商品エラーとして記録し、次の商品へ進む。日次上限で全体停止する処理はない。
- reportのcallsは成功した生成経路の回数で、429再試行の実リクエスト回数を含まない。usageも成功応答分であり、失敗要求の消費まで測定した値ではない。
`api/room-ai.js`：
- 各Groq呼出し前にアプリの日次quota RPCを呼ぶ。既定200、環境変数で設定可能。これはGroqのOTPM／TPM／日次トークン上限を直接制御するものではない。
- 429時はそのAPI要求を終了し、Retry-Afterがあれば応答に転送する。API内の自動再試行・待機はない。後続要求やクライアント側の挙動は別途実測が必要。
結論：最新コミット名の「pace free-tier live validation」は、要求された種類別制御の完成を意味しない。6aは未達。本更新は文書修正のみで、pacingコードを変更していない。

## 現行通常APIが保存する内容
コード確認であり、DB内の実保存行・権限・実際の保持期間を調査した結果ではない。
`api/room-ai.js` → `createCacheStore(db).saveProduct` → `urenavi_product_understanding_cache`：
- cache_key：商品コードと商品名／説明のハッシュから生成。利用者IDはキーに含まれない。
- item_code：商品コード。
- source_hash：正規化した商品名・説明のハッシュ。
- item_name：前処理・正規化した商品名。
- item_caption_normalized：前処理したキャッチコピー＋説明文を正規化した文字列。
- model、prompt_version、schema_version（room_post_single_pass_v2）。
- raw_ai_json：raw_output、final_output（商品概要、引用事実、投稿本文、ハッシュタグ等）、removed_sentence_count、route。
- result_status：ok／unknown。
- expires_at：コード上okは90日、unknownは6時間。期限チェックであり、DB行の自動削除を保証しない。
- updated_at：更新日時。

生成文だけでなく商品情報そのものを含む。通常APIではloadProductを呼ばず、現在は読み出し・再利用しない。共通storeには画像・商品種別の保存／読出し関数もあるが、この通常APIのsaveGenerationでは呼ばない。通常APIはraw／finalもconsoleへ記録する。実際のアクセス範囲・他経路からの共有・ログ保持期間は未確認で、保存の許可を取得済みとは扱わない。

## Golden Live 50：実行済みの証拠
- 対象SHA：`0aaa75e72dddcaa9c96e90e964231e36eb2f2ffd`。
- run：https://github.com/hirobeya/rakuten-affiliate-ai-mobile/actions/runs/36729078016
- artifact：https://github.com/hirobeya/rakuten-affiliate-ai-mobile/actions/runs/36729078016/artifacts/11105495252
- 2026-09-30 23:26〜23:36（日本時間）、workflow／live50 job成功。
- モデル：qwen/qwen3.8-27b。10カテゴリ×5商品、各1回。
- ジョブログの自動集計：完了50、エラー0、accidentCount 0、停止0、abstractCount 0。
- 出力token：平均91.74／p90 120／最大143。入力token：平均1304.38／p90 1290／最大2556。
- text p90 10,447ms、image p90 20,705ms。429再試行ログは8回。
- accidentCountは内部文言・法的NGパターン・根拠外数値の自動検出。意味を変えるすべての誤りや根拠外便益が0という人の判定ではない。
- これはfixtureから生成器を直接呼ぶActions評価で、owner認証済みPreviewの検索／通常API／cache経路の評価ではない。gate 7達成の証拠に置き換えない。
- ログには「40/50そのまま投稿、48/50少し直せば使える、商品特定90%以上を別途判定」とある。人の評価結果は未確認。
- この文書更新後のheadでGoldenを再実行した結果ではない。コードSHAと文書更新SHAを区別する。

## 現時点の判定
Draft維持。gate 0未達、gate 6a未達、gate 6bは楽天回答待ち、gate 2〜5・7の実商品Preview評価証拠は未提出。
検証用mergeとmain／Production反映を別に判定し、CIだけで販売再開しない。
