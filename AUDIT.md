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
