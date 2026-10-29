# P3-B第1段階・実測開始ゲート確立結果

2026年10月29日（日本時間）

## 1．開始HEAD・最終HEAD

Repository: hirobeya/rakuten-affiliate-ai-mobile
Branch: rebuild/urenavi-core-20261028
開始HEAD: 31a1fc92d4cc6d2b9c01531d8f6cd1b823f40153
開始時作業ツリーはクリーン。終了コミットの完全SHAはユーザーへの報告に記載する（自己参照を避ける）。
前回までのdocs/rebuild-20261028全追跡ファイルを開始HEADとバイト比較し一致。preservation.jsonへ保存。

## 2．今回実施した修正

### 初回1通信専用runner

lib/urenavi-core/calibration-runner.jsを追加。既存admissionとisolated-transportを使用した1工程専用の隔離runner。

- 許可をwireHash/model/draft/1回/有効期限へ束縛。無許可、live許可、2回許可、別payload、別工程は拒否。
- 既存4工程preflightから初回を分離。admission.singleで1回分だけ日次・minute・request・split・project予算を確認する。4回分の予約は要求しない。
- 他callerの排他範囲・期間が不明、共有消費が不明なら拒否。0として補完しない。
- attemptId・wireHash・送信前予約・pending eventをfsync＋rename＋directory fsyncで永続化してからtransportへ渡す。
- 保存後に期限と時計を再検査。timeout・429・usage不明・予算超過・保存失敗は停止。保存不能ならlockを保持。
- 同じ共有directoryで再実行しても既存記録を消費済みとして拒否。別商品・別grantでも初回専用台帳から2回目を送れない。
- 正常終了もcalibration_complete_holdで停止。余剰予約を自動解放せず、次工程・再審査・cache公開・ROOM出力へ進まない。
- 生の例外message/codeをrunnerのログへ出さない。transportのhalt codeも固定allowlistに限定。
- calibrationではtransportをusage-only記録にし、providerの任意属性・raw本文・reasoning全文・headersを保存しない。usage数値とcontent hashのみ記録。
- lengthなど未完成応答でも、検証可能なreported usage/reasoning_tokensはHTTP台帳へ残す。ただし未解決状態と全予約を維持し、公開しない。

現在の実行入口はoffline guard必須・offline-test-only許可だけ。実通信の入口、認証取得、秘密値読み出しは実装していない。実通信の明示承認なしにliveへ切り替わる経路はない。将来live接続を行う場合は、その承認範囲内でprovider認証付きtransportと検証済みアカウント情報の接続が必要。

### 互換トークナイザの確保

Pythonインストールは繰り返さず、Node配布と公式公開rankへ切り替えた。

gpt-tokenizer@4.1.0を公開npmから取得。archive SHA512をnpm metadataと照合。必要なCJS runtime 23ファイルとLICENSE/package metadataだけをscripts/rebuild/tokenizer-vendorへ隔離保存した。既存package.json・lockfile・本番依存は変更していない。

OpenAI tiktoken 0.12.0のo200k_harmonyはo200k_baseと同じmergeable ranksを使用する。取得実装の全199998 rankをcanonical base64行へ戻したSHA256は、OpenAI公式expected hashと完全一致：
446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d

独立したjs-tiktoken@1.0.21も一時隔離取得し、保存済み19wireのHTTP JSON/2メッセージ/schemaの76テキストで全token IDが一致。独立側は一時検証だけに使い、本番依存へ追加しない。
全19wireと各componentのdecode roundtripを確認し、原文の空白・Unicode・escapeを保持。source中のtoken風文字列はspecial tokenとして扱わず普通の文字として計数した。

これはローカル文字列の互換計数であり、Groq内部chat template/schema処理の一致証明ではない。

変更：
- lib/urenavi-core/admission.js（1回専用予約追加、既存経路は従来estimateで共通判定）
- lib/urenavi-core/isolated-transport.js（固定エラー記録、usage-only、未完成時のreported usage保存）
- lib/urenavi-core/calibration-runner.js
- tests/rebuild/calibration-runner.test.js
- tests/rebuild/calibration-tokenizer.test.js
- scripts/rebuild/calibration-audit.cjs
- scripts/rebuild/tokenizer-vendor/（固定版・LICENSE・hash manifest）
- docs/rebuild-20261028/p3-first-call-gate/（新規証拠）

## 3．最初の1通信を安全に行えるか

**現時点では未合格。実通信不可。**

解消したもの：互換実装/rank取得、実wireのローカル計数、初回1回の予約・永続化・重複抑止・停止制御。
未解消：Groq内部処理を含む送信前入力安全上限と、実組織/projectの残量・共有消費。前者を単なる余裕2473で代替していない。

初回1工程と20商品比較を完全に分離した。旧新版比較0組/20件不足は、今回の単一初稿校正の停止理由には採用しない。

## 4．未解決の技術的条件

1. Groqが実際に使うrole framing、assistant prefix、system追加指示、JSON schemaの展開方法・上限が未確認。本文/schemaの合計2527やHTTP JSON2579をprompt_tokensとして扱えない。
2. rateの送信前予約が実入力・max completion等をどう計上するか、モデル/projectに対する根拠が未確定。tokenizerの一致だけでは解消しない。
3. 予約上限を入力5000＋出力3000に固定したが、実入力が5000以下というprovider込みの証明はない。provider展開の追加分を少なくとも2473以内と保証できる根拠、または別の検証可能な上限が必要。
4. 代替としてUTF-8 bytes上限も検討した。byte-level BPEでは既知の文字列にbyte数を上限とすることは可能だが、HTTP全体だけでも9791 bytesあり、出力3000込みの粗い枠は12791になる。これはprovider prompt bytesの上限でもなく、8000以内の安全証明に使えない。モデルcontext131072を予約する方式も仮定TPM8000に収まらない。原文・schema・出力上限を削って解決したことにはしていない。
5. live認証接続・別host間の共有同期は今回未実装/未検証。初回は全callerを一時停止して専有する方式なら、分散台帳の新規構築を前提にしなくてよい。ただし全callerの把握・停止期間・共有記録場所を実確認する必要がある。専有を実行したとは報告しない。

Groq公式API/rate/structured output/model資料で、今回のwireに対する入力上限を再現・保証できる完全なtemplate/schema計上式は確認できなかった。「存在しない」とは断定しない。次はproviderの該当実装・公式説明・サポート回答など、対象モデルとschemaを特定した計上根拠を取得する。追加の同一モックや文字換算では解決しない。

## 5．実アカウントで確認が必要な事項

今回、実アカウントの非秘密情報を参照できる認証済み接続は使用していない。account-checklist.jsonは全未確認値をnullのまま保存。

ユーザーが既存のGroq Consoleで確認する手順：

1. 正しいorganizationと対象projectを選択。API Keysや環境変数は開かない。
2. Organization Limitsでopenai/gpt-oss-120bのRPM/TPM/RPD/TPDとモデル使用可否を記録。TPM hoverでITPM/OTPMの適用有無と値を確認。
3. Projects設定から対象projectのモデル別制限を記録。独自値がない場合は「継承」を根拠付きで記録し、不明を継承扱いしない。
4. 対象projectのUsage/Metrics/Logsで同期間のrequest/token実消費を確認。organization全体は他project/他callerも含めて集計する。
5. 分・日次のreset日時/時間帯、snapshot確認日時/有効期限を記録。画面で日次残tokenを確定できないならunknownのまま停止し、管理者の利用集計と照合する。
6. 他用途の実消費と未完了予約、利用するcaller一覧を確認。初回検証中は他callerを停止するか、同じ予算台帳へ参加させる。停止予定だけで消費0としない。
7. 校正用に1request、入力の認証済み上限＋出力3000を組織/project両方で確保。送信直前に再確認し、未解決送信があれば使わない。
8. 成功後も共有枠のholdを維持し、実usage・台帳・provider記録を照合してから明示的に解除する。429/timeout後にtimer再試行しない。

公式rate headerのremaining-requestsはRPD、remaining-tokensはTPMであり、残TPDを表さない。project枠はorganization枠を増やさず、ITPM/OTPMはorganizationだけに設定される。公開Free例を実枠や残量として採用しない。

## 6．選定した検証商品と容量

商品：yukaiya:10001267（洗濯ネット6枚セット）
理由：完全原文10商品の初稿wireの中で、実測した可視component合計が最小。原文やschemaを削らず、最初の容量圧力を最小化できる。

原文hash：1b142873671ba6906329a4217cc8c5a2811feba46c3fa27fdefcbd8ac2854c91
wire hash：ab9f962665d02755d3e2fc683969472466e2da2964e7ce0cb7a13aa3d872d053

- system内容：580 tokens
- user内容（4フィールド原文・条件）：121 tokens
- response_format/schema直列化：1826 tokens
- 上記合計：2527 tokens
- HTTP JSON全体を普通のテキストとしてencode：2579 tokens（provider入力ではない）
- HTTP UTF-8 bytes：9791
- max_completion_tokens：3000、reasoning_effort：medium（維持）
- 1回専用の仮予約上限：入力5000＋出力3000＝8000、request1
- provider込みの認証済みinput upper：未確定（null）
- live authorization/account/sharedUsage：すべて未確定（null）

first-call-plan.jsonに原文、実wire、hash、予算、停止条件を凍結。messages2件＋strict JSON schema。初稿には候補・過去審査はまだ含まれない。原文4フィールドは前回wireと同一。

停止：無許可・別hash・期限切れ・容量不明/超過・残量不明・排他不明・重複・429・timeout・usage不明/超過・保存失敗・未完成。成功しても1回で停止し公開しない。他商品や審査/書直しの容量成立とは判定しない。

## 7．テスト結果

新版：既存162＋今回追加35＝197成功、失敗0、skip0。
既存回帰：454成功、失敗0、skip0。
合計651成功、失敗0、skip0。

追加対象：単一予約、許可/hash/期限、共有消費不明、project/split、durability、timeout/429/usage/length、秘密値canary、reported usage、停止後の保護、競合/再実行、tokenizer hash/全rank/既知vector/全wire roundtrip。
独立encoder比較76テキスト全token ID一致。これは別の検証結果でありテスト件数651に重複加算しない。
offline guardなしのrunner起動拒否も確認。

再現：
./scripts/rebuild/offline.sh scripts/rebuild/calibration-audit.cjs
./scripts/rebuild/offline.sh --test --test-isolation=none tests/rebuild/*.test.js
./scripts/rebuild/regression.sh

## 8．実通信・DB・本番への影響

実Groq通信0、DB接続/書込0、秘密情報読出0、旧版実再生成0。
許可された公開package/実装/rank/資料取得のみ実施。
main/Production/決済/既存本番コード/package.json/lockfile/出力契約/拒否条件は変更なし。
push/PR/Preview/deployなし。既存最大4通信・書直し1回・429自動retry0を維持。初回runnerの上限はさらに厳しい1回。

## 9．P3-B第1段階の開始可否

**未合格・開始不可。**

今回、tokenizer取得不能という前回の障害と、4工程予約しかない構造は解消した。
残る開始条件は、①provider込みの入力計上上限、②実organization/project残量・reset・共有消費、③初回専有窓と記録主体、④上記を使うlive接続の確認、⑤凍結wireの1回だけの実通信明示承認。

20商品比較・旧出力原本の不足を初回校正の前提には戻さない。実通信は次の明示承認まで禁止したまま。
文章品質改善・旧新版比較合格・無料枠継続運用成立は今回の校正準備では判定しない。

## 一次資料・出典

2026-10-29確認。
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/projects
- https://console.groq.com/docs/api-reference
- https://console.groq.com/docs/structured-outputs
- https://console.groq.com/docs/model/openai/gpt-oss-120b
- https://github.com/openai/tiktoken/blob/0.12.0/tiktoken_ext/openai_public.py
- https://openaipublic.blob.core.windows.net/encodings/o200k_base.tiktoken
- https://github.com/niieani/gpt-tokenizer
- npm gpt-tokenizer@4.1.0 / js-tiktoken@1.0.21の固定版metadataと配布物（hashはmanifest/独立照合証拠）
