# Gemini 503 事実ベース調査と暫定運用判断（2026-11-16）
対象：PR #174 / Previewのみ。main、Production、Stripe、Groq台帳は対象外。

## 事実
- 独立実測1（11/13）：Gemini HTTP 503、Gemini/provider 応答は取得済み、本文なし、アプリ502。2,187ms。使用量null。原因本文・ヘッダーは当時保存なし。
- 実測2（11/14）：Gemini HTTP 503、本文なし、アプリ502。使用量null。
- 実測3（11/15）：アプリ側25,001ms providerタイムアウト。Google受理・処理・消費は不明。再送0。
- 実測4（11/16 12:31 JST）：iPhone画面で gemini_http_503_no_retry、生成本文なし、再送停止。保存済みレシートの実JSONは未取得・未照合。
- Gemini 3.8 Flash のモデルIDと low thinking はGoogle公式に記載されたサポート対象。
- Google Gemini APIの公式資料は503を一時的なサービス過負荷または停止、429をクォータ・頻度超過と区別する。ただしこの個別503のバックエンド内部原因は不明。503だけで課金・モデル不適合・Schema不正とは断定しない。
- 関連するVercelのruntime logs検索では対象期間に該当ログなし。Private Blob内の最新診断は所有者認証済みGETでのみ取得可能で、Chat側から所有者Cookieを流用できない。
- 既知の実送信試行は4回。Googleが計上した回数とトークンは不明であり、UIの28日ピーク表示は残量ではない。

## 対応済みの改善
- 実送信ごとに不変claim、0回自動再試行、GET復元。
- プロバイダHTTP待機は最大35秒で関数実行60秒・保存最低10秒を確保。AbortSignalを実HTTP requestへ伝搬。
- HTTP応答後のボディ失敗・アプリの品質評価失敗でも、得られたHTTP status・Provider ID・使用量を可能な限り記録。
- 保存済み503は画面上に診断フィールドを表示。さらに、GETの独自エンジン候補と引用をGeminiの追加通信なしで閲覧できる。候補は品質未認証、未投稿。
- 既存4回の承認を再送しない。追加grantを自動発行しない。

## 判定・次の合格条件
- Gemini正常生成：未達。503が解消した証拠なし。追加通信を繰り返して解決を推測しない。
- 追加実通信の前に、4回目の保存済みGETの responseId・providerDiagnostic・timings・tokens を取り出し、原因を再分類する。内部原因不明なら「不明」とする。
- 主経路は独自文章生成。根拠に紐づく文章候補を検証し、①商品理解②特徴具体性③購入理由④対象場面価値⑤自然さ魅力⑥根拠外ゼロを実例で採点して未達を改善する。
- すべて満たさない限りアプリ完成と判定しない。主エンジンに未検証のGeminiフォールバックを勝手に組み込まない。

参考：https://ai.google.dev/gemini-api/docs/api-errors
参考：https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
