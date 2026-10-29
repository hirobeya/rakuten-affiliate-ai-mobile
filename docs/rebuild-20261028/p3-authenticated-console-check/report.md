# 認証済みConsole確認・実接続障害

開始HEAD: 5c669ad2028e7662708e2711ffd98b44f175d764
Branch: rebuild/urenavi-core-20261028
開始時作業ツリー: clean
確認日: 2026-10-29。個別観察の秒単位timestampは保存していないため直前snapshotとして再利用不可。

## 新たに直接確認したこと

- ユーザーが安全な認証フォームでGitHubを選択し、GitHub画面アクセスとGroq Consoleのread-onlyプロフィール・email・org/team権限を明示承認した。その認可後、別のGroqタブでPersonal / Default Projectのログイン済み表示を確認。組織の追加Grantは実施していない。
- Organization Limits: openai/gpt-oss-120bのRPM30 / RPD1000 / TPM8000 / TPD200000を直接確認。
- Default Project Limits: No custom rate limits set for this project. Organization継承。
- Organization Usage / Activity / Today (2026-10-29 UTC): No usage data for today. 画面注意は最大15分遅延・UTC。直前残量ゼロ消費の証明ではない。projectフィルターの全選択状態は確定していない。
- 対象TPMセルには8Kを表示。分割ITPM/OTPMの適用と値は、この確認では取得できなかった。なし・無制限とは扱わない。
- このConsole文書にWebMCP管理ツールはない。非公開state、cookie、token、API key、network内部は取得していない。

## 実接続の具体的障害

lib/urenavi-core/calibration-runner.jsはoffline_guard_required、grant.mode=offline-test-only、isolation.mode=offline-syntheticを要求。
lib/urenavi-core/admission.jsもmode=offline-syntheticのみ受理。
lib/urenavi-core/isolated-transport.jsはoffline guard必須で認証指定は固定mock bearerのみ。実credentialの安全な注入経路は存在しない。

したがって、既存成果はオフライン動作の実装・検証であり、認証済みlive実行可能とはいえない。Console sessionは推論API認証に流用しない。モックgrant/accountを実情報のように渡す・offline guardを見せかけて通す・Playgroundで代替送信する操作は禁止。既存Vercel環境変数の秘密値を抽出せず、Production/Preview変更やdeployなしで既存runnerへ注入できる手段は今回確立できていない。

## caller確認の範囲

- ローカルcheckoutの.github/workflowsは2件でpush/pull_request起動。scheduleなし。ただしremote最新版・他branchの稼働停止の証拠ではない。
- vercel.jsonには/api/pro-cronの0 21 * * *設定あり。api/pro-cron.jsは商品検索とDB処理を行う。確認したコードから直接Groq呼出とは認定しない。DBへの接続やcron呼出はしていない。
- Groqを利用可能な既存HTTP処理はroom-copy-handler、room-ai-handler、super-urenavi-v3-groq、product-type-knowledge、api/room-ai-v3等にある。コードの存在だけでは稼働中・停止済みどちらも認定できない。
- 実際の他caller停止、未解決送信/予約、minute/day残量・resetは未確認。

## 判断と次の条件

条件付き1通信承認は受領済み。追加の承認を同じ内容で要求しない。
ただし、専有・直前枠不明とlive認証経路未成立のため未送信。
対象yukaiya:10001267 / medium / strict schema / 出力1000 / wireHash 351242d9c86b14994760b18621496db1f195f9d1f657db6317bb40f3062648b4は維持。
入力5000+出力1000=6000は計画予約。provider追加計上を含む保証上限ではない。

必要事項:
1. 管理者が対象org/projectの他caller停止・未解決通信解消を確認する。全端末・Playground・Production/Preview・Actionsを対象とし、照合完了まで再開しない。今回はProduction停止は許可されていないため未実施。
2. ITPM/OTPMの適用、直前消費/resetを非秘密な管理情報で確定する。Today表示だけで補完しない。
3. 秘密値をモデルに返さない認証注入を利用できる実行場所を確定し、既存runner/admission/transportの限定live接続に反映する。現状のモック専用構造を迂回しない。新基盤や通常生成設定変更は不要。

## 影響

今回の推論送信0、DB接続0、APIキー表示/取得0。認証cookie等の抽出0。
GitHub OAuth認可は明示承認範囲で実施。main/Production/決済/通常3000変更0。push/PR/deploy0。
コード変更・テスト再実行なし。前回679件成功を今回の実行結果としない。
認証callback URL、OAuth stateやtoken、email、API key値はこの証拠に保存しない。
