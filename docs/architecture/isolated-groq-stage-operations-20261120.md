# ウレナビ PR #184｜最終実測準備の運用契約（2026-11-20）

この資料は品質実測へ進むための**残作業**だけを固定する。基盤の再設計は禁止。今回の管理者承認は「自己台帳モードの証拠を署名付き宣言へ変更／段階別署名承認を実装し、外部通信なしで検証」まで。**Groq実通信の新規承認ではない**。

## 実装済み
- 自己台帳の証拠は、公式残量を証明するものではない `administrator_declaration`。Free・非課金・組織・プロジェクト・キー指紋・発行時刻・満了時刻を署名対象に含める。最大24時間、有効期限は実行承認を超えられない。独占利用の証明や外部使用量の推測を要求しない。
- 旧 `groq_console` の公式4次元ゲートは未変更。旧方式と混同・共用しない。
- `approval.targets` と `maxCalls` による1段階だけの署名承認。対象・SHA・owner・model・原文hash・見積予約量を既存の `expectedApproval` が固定。各通信の予約・永続的送信意図・保存・停止は従来どおり。
- `--action run-batch` は承認対象を直列で実行し、最初の未成功で停止。自動再送はない。
- `.github/workflows/measure-groq-stage.yml` は手動 `workflow_dispatch` のみ。既定 `mode=preflight` はGroq送信を一切しない。
- 隔離DB正本：`vyzpklomggsazwigxkfh`。従来の全体停止・送信台帳・ロックを使用。現状 `enabled=false` を維持。
- GitHub Environmentが実際にレビュー承認可能な状態でなければ、`GROQ_MEASURE_ENV_REVIEWERS_CONFIRMED=configured-and-reviewed` を設定してはならない。この値は技術的にGitHubレビュアー設定を自動検証するものではなく、管理者による設置確認の宣言である。

## 必要なGitHub Environment設定（管理者操作・未完了）

1. リポジトリで `Settings → Environments → groq-measure` を作成し、**required reviewers に管理者を設定**。登録できないプラン／リポジトリ設定なら実測は中止して代替方法を設計審査する。
2. 直前のレビューを済ませてから、Environment variable `GROQ_MEASURE_ENV_REVIEWERS_CONFIRMED=configured-and-reviewed` を設定。レビュアー無しの環境で設定してはならない。
3. Environment secret（本番の値や公開リンクには設定しない）：
   - `URENAVI_COMPARISON_GROQ_KEY`：実測専用Freeキー
   - `URENAVI_GROQ_ORGANIZATION`、`URENAVI_GROQ_PROJECT`：Groqの管理画面と完全一致
   - `URENAVI_COMPARISON_REMOTE_SERVICE_KEY`：隔離Supabase `vyzpklomggsazwigxkfh` のservice-roleキー
   - `URENAVI_COMPARISON_REMOTE_PUBLISHABLE_KEY`：同じ隔離Supabaseの公開キー（アクセス認証用）
   - `URENAVI_COMPARISON_REMOTE_OWNER_EMAIL`、`URENAVI_COMPARISON_REMOTE_OWNER_PASSWORD`：実測専用認証ユーザー
   - `URENAVI_ISOLATED_OWNER_ID`：上記ユーザーのAuth ID。サーバー管理の `app_metadata.urenavi_role=owner` を必要とする。ユーザー編集可能なmetadataでは不可
   - `URENAVI_APPROVAL_PRIVATE_PEM_B64`、`URENAVI_EVIDENCE_PRIVATE_PEM_B64`：別々のEd25519秘密鍵のPEMをbase64化した文字列。公開・ログ出力・リポジトリへの登録禁止
   - `URENAVI_FROZEN_INPUTS_B64`：固定20商品の保存済み原文配列。変更・切り捨ては禁止。実行側が固定インデックスとhash照合する
4. プロジェクトの送信許可 `urenavi_self_budget_policy_v2.enabled` は管理者承認と開始直前の条件照合が完了するまで `false` のまま。
5. GitHub `workflow_dispatch` はワークフローファイルが**デフォルトブランチに存在しないと起動できない**。PR #184 全体を品質検証前にマージして実測を急がない。必要ならワークフローだけを安全な独立PRとして審査する。

## 手動実測の承認境界
- 事前準備：`mode=preflight`。ユーザーがFree・支払方法未登録を管理画面で確認し、`free_confirmation=I_CHECKED_GROQ_FREE_NO_BILLING` を入力。署名・ハッシュ・固定対象の検証のみ、Groq通信0。
- 実通信：別途「対象SHA、固定商品、最大1回」を承認後、`mode=send` を選び、`provider_authorization=I_AUTHORIZE_GROQ_LIMITED_MEASUREMENT` を入力。GitHub Environmentのレビュー承認と秘密値の配置が必要。
- 段階1は `arm=B`／`stage=generate`／`max_calls=1` のみ。Groq側のmodel表記、usage、DBのreservation・intent・settlement、journalのclaim/result/terminalを照合。いずれか不明なら中止・自動再送禁止。
- 通信に成功しても品質合格とみなさない。固定20商品Bの盲検評価と未知18商品による再現を別に実施する。
- 送信停止後の解除は既存の `isolated-groq-measurement-runbook-20261120.md` に従う。無監査の `halted=false` は禁止。

## 終了判定
現段階で完了と呼べるのは**設計変更と通信なし安全検証**まで。外部Groq通信0。文章品質80%以上の実証、楽天API/ROOM規約、Vercel商用条件、iPhone実機、決済・料金は未完了。全て揃う前に販売承認・本番マージをしない。
