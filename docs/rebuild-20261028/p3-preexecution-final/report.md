# P3-B初回実測・実行直前の最終判断
2026年10月29日（日本時間）

## 1．開始HEAD・終了HEAD
開始HEAD：8a8a3263c1afe6563be140bd9af62a5dc5427192
Branch：rebuild/urenavi-core-20261028。開始時クリーン。
終了HEADはこの文書コミットの完全SHAをユーザーへ記載。文書以外変更なし。既存証拠は開始HEADとバイト比較し一致。

## 2．実アカウント確認
Personal／Default Project、project独自制限なし、RPM30/RPD1000/TPM8000/TPD200000はユーザー確認済み設定値として継承。
今回cloud browserからhttps://console.groq.comへアクセスし、https://console.groq.com/homeでLog Inリンクの表示を確認。認証済み管理情報は取得できなかった。ログイン操作、API Keysアクセス、秘密値取得は行っていない。
直前request/token消費、reset、snapshot有効期限、未解決送信/予約は未確認。過去の「Today使用なし」を現在残量に使わない。

## 3．ITPM／OTPM
適用有無と値は未確認。無制限/なしと補完しない。ユーザーが認証済みConsoleのOrganization Limitsで対象modelのTPMへhoverし、X in / Y out等の分割表示の有無と値を確認する。確認日時/timezoneを記録する。表示に到達できなければ「確認できない」として開始不可を維持する。

## 4．今回取得した他caller関連の管理情報
Vercel connectorをread-onlyで使用。対象teamとrepositoryの紐付くdeployment metadataを確認。環境変数/キーは取得せず、稼働URLへのアプリ要求も送らなかった。

- 直近3deploymentはPreview系（target=null）でREADY。最新はdpl_Dam9eYSoDLucZS3QrcfJa3ZrXj4y、旧branch fix/urenavi-quality-contract-20261016、SHA f6f6c95b2e5322e872b2db8ab02b7c5bb4c3ddad。これをローカル新版のdeploy済み証拠とはしない。
- 対象project prj_SAJCw9vvSR79pNT3gJCNcXWItGs8に対し、production/previewそれぞれsince=30m、requestPath集計で照会。双方とも集計行なし。応答はtop25 groups形式であり、ログ保持/集計/未出力処理等の限界を含む。request0、Groq消費0、in-flightなし、全環境停止の証明ではない。
- GitHub connectorで上記f6f6c95…のPR workflowのfirst pageを確認。Verify Urenavi(run40430144274)はcompleted/success、ROOM Copy Regression(run40430144276)はcompleted/failure。過去コミットの状態であり、現ローカル679件のテスト結果とは別。全branch/全workflowの実行中jobなしとは認定できない。古いfailureの調査や再実行は今回範囲外として行わなかった。
- /procのprocessNameとcwdだけを確認し、このcheckout内をcwdとするnode/npm/bun/deno/vercel processの一致はなし。argv/envは読んでいない。別cwd/別host/Playground等のcallerを網羅するものではない。

認証済みVercel/GitHubから確認できる範囲は増えたが、他callerの実停止・共有消費・未解決送信の解消は依然未確認。管理照会の原結果と照会日時はmanagement-observations.jsonへ保存した。ログ本文は取得していない。

## 5．専有条件
不成立（未確認）。ログ行なしや過去workflow完了だけで専有済みとしない。
専有期間：実行直前のsnapshot取得から、1通信終了後のprovider記録と両台帳照合・operatorによるhold解除まで。他callerの再開はその後。任意の固定分数を安全根拠にしない。

管理者が行う手順：
1. 全Groq callerを一覧にして、Production/Previewの生成操作を停止しタブを閉じる。Actionsの全実行中job/予定、dev server/CLI/他host/Playgroundの実処理を確認して停止または完了待ちにする。
2. UI操作停止だけではHTTP caller停止を保証できない。実効的な受付停止が必要なら、今回禁止のProduction操作をこちらで行わず、別途承認済みの管理者運用で確保する。
3. in-flight/未解決送信/予約を非秘密ログ・管理記録で照合。不明は消さない。
4. Groq UsageのUTC期間/反映遅延を踏まえ、既知消費・reset・splitを確定。snapshot取得日時/期限と専有終了条件を記録する。
5. 初回だけ実行し、成功も失敗もhold。未知usage時に再送・予約解放をしない。照合完了後operatorが他callerを再開する。
今回は停止/設定変更は一切していない。

## 6．校正1000の判定とリスク
原文/schema/mediumを保持した1000wire：351242d9c86b14994760b18621496db1f195f9d1f657db6317bb40f3062648b4。
1request、入力計画予約5000＋出力1000＝6000。6000は最大想定の計画予約で、保証最大総消費ではない。provider追加計上・受付時の予約・失敗時消費は未確定。実入力5000/合計6000を超える可能性と、出力1000での推論/JSON中断の可能性を維持。
専用事前計数APIの探索や同じtokenizer検査は行わない。今回は未知消費を含む限定実験の開始前提（実枠/専有/承認）が揃うかの判断。元の完全事前保証を再び要求する無限調査には戻さない。

## 7．runner実行準備
前回の1000専用接続を維持。wire許可・1回予約・送信前durability・両台帳照合・retry0・timeout/unknown/保存失敗停止・未完成非公開・正常後holdが実装済み。今回はコード変更/再テスト不要と判断した。
前回新版225＋回帰454＝679成功は前回結果として維持し、今回再実行済みとは報告しない。
実認証は未接続、offline guardとoffline-test-only許可を維持。実通信承認のない現在、liveを有効化していない。非秘密な実行直前事実の取得、承認、承認範囲での実認証接続が残る。秘密値を表示・保存する方法では接続しない。

## 8．初回開始可否
未合格・開始不可。直前共有枠と専有が確認できず、別途実通信承認もない。
実装を追加して解決する問題ではない。今回新たに確認したread-only管理結果でも専有は認定できないため、停止判断は確定。

## 9．ユーザーの最小操作
A. 自身の認証済みGroq Consoleで、TPM hoverの分割有無/値と、直近消費/resetを取得し、確認日時/timezoneを記録する。APIキーは不要、共有しない。
B. 全実行環境の停止/既存通信の解消を管理者が確認し、専有開始・終了条件と確認者を記録する。こちらで確認できたのはVercel直近30分の集計行なし・限定GitHub run完了・当該cwdのprocess一致なしまで。
C. A/Bが成立した後、6000は保証上限でないことを含め、上記1000wireの1通信に限る別明示承認を行う。条件未確認のまま「承認」だけで送信しない。

## 10．影響
実Groq推論0、DB接続/書込0、秘密情報読出0、Production停止/設定変更0、APIキー操作0。
通常3000・外部契約・拒否条件・main/決済/認証変更なし。旧版再生成/push/PR/Preview/deployなし。
今回の外部操作は管理APIの読み取りと公開Console画面の認証状態確認のみ。
