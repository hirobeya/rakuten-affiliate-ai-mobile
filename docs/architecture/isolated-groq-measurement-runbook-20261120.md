# ウレナビ PR #184｜隔離比較実測・停止時の管理者手順（通信なし準備）

対象：**実測専用** Supabase `vyzpklomggsazwigxkfh`。main／Production／Stripe／本番認証・DBには適用禁止。

## 事実として成立済み
- 4本の隔離SQLが適用済み。最新のDBで8テーブル・14関数を確認。
- `urenavi_self_budget_policy_v2.enabled=false`。外部Groq通信は未承認・未実施。
- service_roleだけが容量・比較記録RPCを実行でき、一般利用者に公開されていない。
- DBのジャーナルはローカルファイルより優先する永続正本。GitHub ActionsのArtifactは正本にしない。

## 実測を始める条件（全て必須）
1. 実測用環境が `vyzpklomggsazwigxkfh` のみを指していること、組織・キー指紋・モデル・固定入力ハッシュ・実行SHAを照合する。
2. GitHub Environmentの承認、承認対象SHA・商品・arm・stage・上限を固定した**署名済み承認**を確認する。
3. GroqのFree利用状況、組織アカウント、支払方法・課金状態は**管理者が実際に確認**する。自己申告を公式の残量証拠と混同しない。
4. 現行self-ledger方式の60秒有効・独占利用要件を緩めるには別の明示的な管理者承認とテストが必要。承認なしに現行条件を書き換えない。
5. DBの `enabled=false`、`halted`、未解決`sent`、journalの`execution-lock`、未終結`claim`を確認する。最初から不明な状態を「0件」と推測しない。
6. 最大通信数・自己予算・生成と検証の別の予約上限を照合し、すべて揃うまで外部Provider送信0回。

## 停止したとき（全ての自動再送禁止）
1. 直ちにGroq送信を止め、同じattempt IDで再送しない。未知の使用量は推定上限分を保守的に保持する。
2. 以下を読み取り専用で照合する：
   - `urenavi_self_budget_attempt_v2` の `id,tenant,reserved_at,estimated_tokens,outcome,actual_tokens`
   - `urenavi_capacity_attempt_v2` の未解決`sent`・`unknown`・`rate_limited`
   - `urenavi_capacity_provider_v2.halted`
   - `urenavi_comparison_journal_v2` の `execution-lock`、`*-claim`、`*-result`、`*-terminal`、`*-halt`
   - Groq管理画面の使用量、ヘッダー、プロバイダーRequest ID。特定できない残量は`unknown`。
3. **観測できない使用量や未解決送信をゼロと見なさない。** 証拠が揃わない場合は停止継続。
4. `execution-lock` は期限切れだけでは解除しない。実行プロセスが停止していること・関連IDの不確実性を管理者が調査する。
5. 既存の`comparison_resume_v2`は公式4次元証拠を要求する旧方式用。自己台帳にそのまま流用しない。
6. **SQLで`halted=false`を直接書き込んで再開しない。** 現行self-ledgerには安全な管理者専用の永続監査付き解除経路が未実装。解除条件と監査記録が明確になるまで停止を維持し、`-recovered`記録だけを作って再送許可にしない。
7. 修正は隔離ブランチで行い、再送0回のモック異常系とPostgreSQL回帰を通す。実Provider再開は改めて管理者承認。

## 販売品質への最短移行
- インフラ準備を目的にしない。プロバイダー実送信前に、A/B/Cの比較原文が保存済みの原文・hashと一致するか検査する。
- 最初は承認済み商品・段階の**最大1実通信**だけ。結果保存とプロバイダーusage、正式なモデル表記を照合。
- 安全性成立後、固定商品群・未知の商品群で6軸のブラインド評価を行う。**根拠外の重要主張0、6軸合格率80%以上**を販売判断の目標とする。
- Aの不合格を自動的に公開文へ切り替えず、代替方式も独立審査を通過したものだけ表示。

## 未完了／承認が必要
- 60秒証拠／独占利用条件の緩和（安全条件変更）
- 単一署名を複数stageへ広げる方式（承認範囲変更）
- GitHub Actionsから隔離Supabaseに接続する環境Secrets・管理者用認証・承認鍵・証拠鍵
- 自己台帳の停止解除用の安全な監査・整合性確認（実測停止後の再開時）
- 比較方式の最終採用、iPhone E2E、楽天API規約・Vercel商用条件・採算・Stripe回帰
