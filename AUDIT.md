# ウレナビ総点検 — 2026-09-06

対象: `urenavi-icon-fix` / PR #5。開始時 HEAD `a72a7bf`、main `266f17c`。
**未完了。実際の TEST Checkout と Magic Link を含む E2E が通るまでマージ禁止。**

## 実測

- GitHub: PR #5 open / merged=false。Production は main `266f17c` の READY デプロイ。
- 修正前 Preview `/api/access?action=buy`: HTTP 302 で LIVE `buy.stripe.com/dRm14nd9G7r1eDK2VPgfu00` へ転送。不合格。
- Node 自動テスト15件合格: 環境不一致、未設定、署名改ざん/期限/形式、解約/期限切れ/未購入、30日/失効セッション、再送、DB障害時再試行、購入条件、検索スコア・リンク。
- Supabase 実DB: RLS有効。新テーブルの anon INSERT不可、authenticated RPC不可、service_role RPC可。古い同期更新を拒否。不存在セッション拒否。検証データはトランザクションでROLLBACK。
- Supabase migration `urenavi_isolated_billing_and_session_check` 適用済み。既存購入情報は変更しない追加構成。
- ローカル実ブラウザー: 未ログイン `/app.html` はログイン画面のみ。模擬購入済み/模擬商品で検索・上位3比較・今日売るならこれ・ROOM/Threads/Instagram切替表示確認。コピー操作は「コピーしました」表示。これは外部サービスの E2E ではない。

## 修正

- Preview/ローカルはTESTキー必須、ProductionはLIVEキー必須。PreviewでLIVEへfallbackしない。
- 購入前に価格980JPY/月、Payment Linkの環境・URL・有効状態・上限30件・activate戻り先を照合。
- Webhook: raw body署名/HMAC・5分許容、環境確認。checkout.session.completed / async_payment_succeeded、customer.subscription.created/updated/deleted、invoice.paid/payment_failed/payment_action_required。
- Webhookは最新Stripe Subscriptionを取得し同期。失敗は503で再試行、繰り返しは同じ行にupsert。観測時刻による古い更新拒否。購読ID別のため以前の購読解約で新しい購読を無効化しない。
- `urenavi_entitlements_v2` はlivemode+subscriptionで分離。検索・画面ともサーバー認証、実際のStripe状態/Price/契約期限を判定。旧Production購入・ownerは読み取り互換あり。
- 30日はユーザー全体のlast_sign_in_atでなく、検証済みJWTのsession_idに対応するauth.sessions.created_atから判定。ログアウトされたセッションを拒否。
- activateからメールアドレスをURLに出さない。APIの詳細エラー/外部応答を返さない。画像・商品リンクをHTTPSに制限しHTMLエスケープ。
- 期限切れ/解約/401/403で画面遮断。画面復帰時と60秒ごと再確認。ログアウト時に検索結果と履歴を消去。
- `/app.html`開始のmanifest追加。既存アイコンは1254×1254 PNG。古いlanding.htmlを現行LPへ誘導。
- Supabase CDNを2.115.0に固定。セキュリティヘッダー、CIを追加。

## 必須の環境・外部設定（値の現状は未確認）

| 設定 | Preview | Production |
|---|---|---|
| STRIPE_SECRET_KEY | TESTのsk_test_/rk_test_ | LIVEのsk_live_/rk_live_ |
| URENAVI_PAYMENT_LINK_URL | TESTのbuy.stripe.com/test_… | 既存LIVEを維持 |
| URENAVI_PAYMENT_LINK_ID | TEST plink | 既存LIVEを維持 |
| URENAVI_PRICE_ID | TEST price | 既存LIVEを維持 |
| STRIPE_WEBHOOK_SECRET | TEST endpointのwhsec_… | LIVE endpointのwhsec_… |
| URENAVI_APP_URL | 安定したbranch Preview origin | https://rakuten-affiliate-ai-mobile.vercel.app |
| SUPABASE_SERVICE_ROLE_KEY | サーバーのみ | サーバーのみ |
| RAKUTEN_APP_ID / ACCESS_KEY / AFFILIATE_ID | 実検索用 | 既存を維持 |

- Stripe endpoint: 各originの `/api/webhook`。上記イベントを登録。Preview保護がある場合、Stripeが届く設定を確認。
- Stripe Payment Link: `restrictions.completed_sessions.limit=30`。
- Stripe after_completion: redirect、`<各origin>/api/access?action=activate&session_id={CHECKOUT_SESSION_ID}`。
- Supabase Redirect URLs: Production `/app.html` と安定したbranch Preview `/app.html` をそれぞれ登録。Production Site URLを維持。曖昧な全Previewワイルドカードは避ける。
- Previewの同じメールでもLIVE利用権限は付与しない。既存Authユーザーは共通だが購入判定は分離。
- 税込980円表示とStripe tax_behavior/税設定の一致は未検証。税設定を自動変更しない。

## 未検証・マージ条件

1. Vercel Preview/Productionの変数スコープ・実際の値種別、Stripe設定、Supabase Redirect URLs。
2. TEST Checkout→Webhook→activate→メール受信→Magic Link→/app.html→実楽天検索→投稿文→コピー。
3. TESTの未購入・解約・期限切れを使った実デプロイ遮断、Webhookの実配送/再送、30件目/31件目境界。
4. 最新コミットのPreview正常デプロイ、PR diffレビュー、CI成功。
5. 指示「本番E2Eまでマージ禁止」と「Preview→merge→Production smoke」の両条件を満たす本番確認範囲。実課金・iPhone操作は実測が必要。
6. merge→Production smoke→iPhoneホーム画面の `/app.html` 起動。現在は未実施。

Supabase advisorsには既存trigger関数の公開実行権限/search_pathと漏洩パスワード保護の警告がある。新テーブルのRLS no policyはサーバー専用として意図した拒否構成。既存警告を解消済みとは扱わない。

## 追記: 実サービスの確認（2026-09-06）

- `b29556e` の GitHub Actions (run 34005833320) は success。Vercel `dpl_7P6h38CuX13KoTV6rNztn9vjcTA4` は READY。
- 実Preview: `/` 200、`/app.html` 200、`/manifest.webmanifest` 200、未認証検索401、購入API503かつLocationなし。LIVEへの誤転送は止まったが、決済成功ではない。
- 実Previewブラウザー: LP→購入済みリンク→`/app.html`のログイン画面。未入力メールへの案内を確認。取得時のconsole errorなし。
- Production読み取り: `/` と `/app.html` は200、未認証検索401。既存mainには `/api/access` とmanifestがなく404。Production E2E合格ではない。
- Vercelのプロジェクト変数は6件。楽天3変数はProduction/Preview、購入設定3変数はPreviewのみ。共有変数なし。STRIPE_SECRET_KEY、SUPABASE_SERVICE_ROLE_KEY、STRIPE_WEBHOOK_SECRETは未登録。
- Stripe TEST: Price `price_1UCPJREYXoynxoEYEC0co5VE` は980JPY/月、quantity=1、税込(inclusive)。Payment Linkのafter_completionをPreview activateに変更し、上限30件を設定。戻り値で確認。
- Stripe LIVE: Price `price_1UAfsLEYXoynxoEYlxhQcJL9` は980JPY/月、quantity=1、税込(inclusive)。既存購入リンクは上限30件・本番activate、count=0。変更していない。automatic_taxは両環境false。
- TEST Webhook `we_1UCa13EYXoynxoEYDgaDXaFt` をPreview `/api/webhook` に登録。enabled、API version 2026-08-26.dahlia。署名secretは生成済みだがVercel未設定。実配送成功は未検証。
- LIVEには既存 Supabase Edge Function `stripe-webhook` (version 7) があり、Stripe endpoint `we_1UBB4oEYXoynxoEY4tRkFI1s` から配送。`stripe_entitlements`を書き、今回の旧`urenavi_entitlements`/新v2とは別。現行コードはCheckout支払・Price・mode確認不足、エラー履歴でも再送を処理済み扱いする問題あり。既存本番を変更していない。新Webhookとの切替/接続はマージ前条件。
- ローカル模擬データ: 履歴の保存・再表示・価格条件復元、ログアウト後の結果DOM消去を確認。検索データは模擬で、実楽天検索E2Eではない。
- 新たに公開ファイル構文/秘密キー検査と、解約後に遅れて届くCheckoutイベントの回帰テストを追加。合計17件PASS。
- 取得済みGit履歴のStripe秘密キー・Webhook秘密キー・Supabase secretキー形式の検索は0件。すべての秘密形式や外部ログまで保証する検査ではない。
- Stripeブラウザーは既存保存情報でログインし、本人のTouch ID認証待ち。値をチャットへ貼る必要はない。

## 最終指示との再照合（継続作業）

GitHub実測：PR #5は2026-09-06 09:09 UTCに既にマージ済み。最新対象HEADはd6e3a3c、merge commitは28a89ba。本作業からマージ操作は行っていない。以前の「未マージ」記録は当時の状態であり現在の状態ではない。

最新コードの180日端末Cookieによる認証迂回と、status応答による期限更新を除去。Supabaseの検証済みセッションと30日判定を必須に戻した。ログアウト処理を上書きするガードを除去し、履歴消去処理を維持。既存Cookieの削除APIは維持するが認可には使用しない。PreviewのLIVE owner例外も元の環境分離に戻した。

API応答の小整理：accessの400/405/503に安定したcodeを追加、access/webhookの405にAllowを追加。外部エラーや秘密値は返さない。

自動テスト19件PASS（実外部E2Eとは別）。解約予約の支払済み期限の直前は許可、期限ちょうど・直後は拒否。即時canceled、未購入、支払失敗、失効セッション、署名改ざん・再送・DB障害も検証。画面の表示更新は最大60秒周期または復帰時であり、即時に既表示画面が消えるという保証ではない。APIは各リクエストでStripeを照合する。

| 最終指示項目 | 状態 |
|---|---|
| LP・購入導線・980円先着30件 | 実Stripe設定は前回確認、最新本番の再確認が必要 |
| activate・Webhook・Supabase同期 | 実装と回帰テスト済み、実配送・決済E2E未確認 |
| Magic Link・直アクセス・30日再認証・ログアウト | 認証迂回を修正、実メール/iPhone未確認 |
| 未購入・解約・期限切れ・検索API認証 | 自動テスト済み、実TEST解約E2E未確認 |
| スコア・履歴・上位比較・今日の商品・投稿文・コピー・楽天リンク | 前回模擬ブラウザー確認、実楽天検索/コピー貼付未確認 |
| 法務ページ | docs/legal-draft.mdに3ページ分原稿。販売者情報・返金・実解約導線・保存期間が未確定のため未公開 |
| Preview TEST / Production LIVE、Redirect URL | 最新環境設定の再照合が必要 |
| 秘密情報非露出 | 公開資産検査PASS、認証迂回Cookie廃止 |
| PR diff/CI/merge | #5は既に外部でマージ済み。今回の変更は対象ブランチだけ、追加変更のCI確認が必要 |
| Production smoke / iPhoneショートカット | 未完了 |

法務原稿の確認元：消費者庁 https://www.no-trouble.caa.go.jp/what/mailorder/ 。法的適合の保証ではない。正式販売者名、運営責任者、住所、電話・公開メールは本人提供が必要。
