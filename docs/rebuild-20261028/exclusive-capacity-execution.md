# Free限定校正：観測可能な証跡による実行条件

2026-11-07改訂：以下の完全台帳/排他方式は**組織全体の事前余力を保証する従来方式**として残す。今回、比較専用に`provider-limited-one-shot-v1`を追加した。これは「管理対象の1通信と予約・消費照合を保証し、未知の組織使用量についてはGroq自身の制限判定に従い、429で即停止する」別の承認対象である。全組織の空き枠・排他を保証したとは扱わず、従来の保証と同等と表示しない。旧SHA/旧方式の承認で有効にならない。

## 改訂：管理範囲を限定した単発試行

- A（公式）：組織/モデルのRPM・RPD・TPM・TPD、適用時の入出力別制限。providerが制限超過を429で拒否する。Freeの現在プラン・30/1000/8000/200000はアカウント画面で再確認した。split内訳は未確認のまま保持し、適用なしと推測しない。
- B（維持する装置）：固定wire/9791bytes/推定5000+出力3000、送信前8000永続予約、既存create-only永久claim、旧失敗receipt検証、未処理/不明消費/保存失敗停止、429停止、no retry、非公開保存。これらは新方式でも既存runner/transportで実施する。
- C（従来の独自要件）：24時間の全送信履歴完全証明・全caller停止・provider残量の送信前完全把握。同じ実験の重複防止には不可欠ではない。本体を変えず全組織保証を維持するには必要だが、管理対象の単発試行には要求しない。代わりに、**保証範囲が異なることと競合/拒否の可能性**を新しい実通信承認で明示受容する。

### 現在の送信元と管理範囲

|経路|今回確認した事実|新方式の管理範囲|
|---|---|---|
|Production|READY、実行SHA3fb18811de413448384317f2beead78cd29a2ae3。既存V3の既定モデルはqwen、設定上書きや呼出し可能性は否定しない|変更/停止せず、使用量・in-flight・排他を不明のまま保持|
|隔離Preview|校正APIだけを配備。旧claim/receiptと比較namespaceをprivate Blobで確認可能。実行flagは無効|旧対象要求の照合・新実験のclaim/予約/消費・競合拒否を技術的に管理|
|通常Preview|本体APIにGroq経路がある|全デプロイ停止とは主張しない。管理外として不明保持|
|GitHub Actions|現在の2 workflowはオフライン/回帰検証。中核はnetwork/credential guard付き|CIを実推論送信元とは扱わない。他の人手起動の不存在を証明したとはしない|
|このworkspace CLI|GROQ_API_KEY存在false。旧1000 CLIは許可snapshotとcredential必須|他端末のCLIまで停止したとは主張しない|
|Playground/他アプリ|ウレナビだけを利用、管理者は手動生成していないという受領済み回答|回答を保持して再質問しない。技術的な全経路停止の証明にはしない|

新preflightはoperator認証後にサーバー側で旧private receiptと比較namespaceを読み取り、`capacityMode:provider-limited-one-shot-v1`のsnapshotを組み立てる。claim・校正・HTTP記録が一つでもあれば拒否する。送信時にも再読取りし、claimは同じ既存の実験ID/namespaceを共有する。異なるmodeや同時要求で実測枠を増やせない。

未知の組織消費・残量・未処理は**null**。ローカル会計のscopeは`controlled-calibration-only`。`otherWindowTokens:0`は空の管理対象namespaceと照合済み旧終端要求に限った値で、組織全体の使用量0ではない。旧3729は保持6000へ一度だけ包含、別の既知保持8000も保存する。新予約込みの既知拘束は22000だが、これを組織全体の日次消費上限と偽らない。

新方式のHTTP200は**管理対象の単発試行の事前検査合格**であり、`organizationCapacityGuaranteed:false`、`allCallersPaused:false`、`executionApprovalStillRequired:true`を明記する。混雑/未知消費が残っていても「残量がある」とは主張せず、providerの429拒否を許容して一度だけ試行する方針である。この保証範囲を認めない場合は新方式を実行せず、別途本体を含む共有ゲート適用が必要。

承認後の実行接続も同一SHA内に準備した。`approved-comparison-once.cjs`は通常はno-op。新SHA/新方針の正式承認後だけ、当該Preview branchの`URENAVI_APPROVED_COMPARISON_GRANT`へ非秘密のgrant JSONと既存Free実行flagを設定して同一SHAを配備する。新しいgeneratorは作らず、既存の認証付きexecute APIを一度だけ呼ぶ。snapshot/入力予約/namespaceは実行環境で直前に読み直す。claimがある場合やgrant不足ならAPI呼出し前に停止し、API失敗時も再試行しない。承認のない今回、grant変数を作成せず実行flag無効を維持する。これにより実通信承認後に接続コードを変更して再びSHA承認を求める循環を避ける。

実行時に`URENAVI_PRIVATE_CALIBRATION_REVIEW=include-unreviewed-candidate`を明示した場合だけ、成功後にprivate台帳を再読取りし、Schema適合済みの未審査candidateを非公開の実行ログへ取り出して品質評価できる。通常APIへ本文を返さず、失敗文・reasoningは取り出さない。公開採用は別審査。今回この設定も行わない。実行後はgrant/Free flag/一時検証先を解除する。永久claim・予約・監査記録は解除しない。

実行には旧3リスク項目と新SHA承認に加え、grantの`capacityPolicy:provider-limited-one-shot-v1`、`providerLimitRejectionAccepted:true`、`unmanagedUsageUnknownAccepted:true`、`capacityPolicyApprovalReference`が必要。今回これらを承認済みと作成せず、推論無効を維持する。preflightと実送信の間の管理対象競合は永久claimが止める。管理外経路との競合は止めたと偽らず、新方針の承認に含める。

現在プラン/制限の観測は最大24時間で失効する。実行前にWorkが読み取りを更新し、必要なら当該Preview branchだけの`URENAVI_GROQ_LIMIT_OBSERVATION`へ非秘密のJSONを設定し、同一SHAを再配備する。入力条件/wire/生成器を変更せず、観測更新のためだけに新SHA承認を要求する循環を避ける。新実験の事前検査snapshotは55秒で失効し、直前に再取得する。

通信なし検証：中核464件、既存454件、合計918件成功・失敗0（新方式33件、実行接続12件を含む）。実Previewのread-only helperは従来証拠欠落の412拒否と、新方式の200/未承認/未知使用量nullを両方検査し、旧台帳/新namespaceが変わらないことを確認する。生成成功や文章品質の達成をこの検査で代用しない。

今回の追加Groq通信は0。推論flagは変更しない。固定wire ab9f962665d02755d3e2fc683969472466e2da2964e7ce0cb7a13aa3d872d053、商品、medium、Schema/strict、入力推定5000・出力3000・予約8000は不変。新SHAの実通信には改めて明示承認が必要。

## 停止条件の分類と目的

|分類|条件|防ぐ事象／扱い|
|---|---|---|
|A：公式|組織RPM/RPD/TPM/TPD、適用時ITPM/OTPM、Project上書き制限|providerによる上限超過。別キー/Projectで組織枠は増えない|
|B：独自|永久claim、送信前8000予約、旧6000保持、未処理/消費不明停止、429停止、no retry、非公開保存|重複、不明消費の再利用、未審査文の公開|
|B：独自|全caller排他、全通信の終端と消費照合|ゲート外送信との競合・過小計上。公式が全caller停止を要求するわけではない|
|C：実装制約|比較台帳と本体の送信制御が別、60秒未満の残量証拠しか受理しない|比較claimだけでは本体を止められない。静的な照合履歴にも同じ鮮度を要求し実行不能にしていた|
|D：取得方法未確認|追加推論なしで送信直前のprovider残量・resetを返すAPI、組織全体のin-flight一覧|現行の公開資料では取得方法未確認。存在しないと断言しない。遅延Usageを代用しない|
|D：取得不能な保証|provider内部の送信前入力計数をローカル計数だけで完全保証|入力5000は推定のまま。既存の残余リスク承認と9791bytes固定検査を保持|

公式確認：[Rate Limits](https://console.groq.com/docs/rate-limits)、2026-11-07。残量/リセットはHTTP応答ヘッダーとして掲載されている。request系ヘッダーはRPD、token系はTPMであり、RPM/TPD残量と誤認しない。ITPM/OTPMはLimitsのTPM hover内訳で確認する。Usageにはアカウント画面で最大15分遅延が表示されている。

## 採用した実行方法

比較専用に`exclusive-ledger-window-v1`を追加した。既存の「現在容量を直接示す証拠」経路は変更しない。新経路はproviderの現在カウンター取得を要件にしない代わりに、以下をすべて要求する。

1. 管理者が全送信元の一覧と継続停止区間を確定する。Productionサービスを停止/変更する必要はないが、生成操作をする全利用者/端末を管理できなければこの方法は使えない。
2. 全組織の少なくとも直近24時間をカバーする送信元記録とGroq Logsを照合する。対象モデルだけの表示、ページ途中、空Usage、自己申告の「利用なし」だけで完全な台帳を作らない。旧対象要求は期間外でも必ず含める。
3. 全送信元が停止した時刻まで監査対象をカバーする。開始済み要求はRequest ID・終端応答・既知usageで照合する。timeout/結果不明/usage欠落/429、未処理予約は拒否する。旧失敗だけは既存receiptに完全一致する記録として扱い、原本は未照合表示のまま保持する。
4. 最後の既知終端応答と停止区間開始の両方から60秒以上経過し、送信停止が継続していることを管理者が直近60秒以内に確認する。時刻経過だけでは通過しない。遅延ログを照合した場合も、データが停止開始までカバーしているという根拠が必要。
5. この組み合わせから分間の**ローカル予約余力**を8000と算出する。provider残量/resetを観測したとは記録しない。公式の分間制限と完全な送信監査・継続排他に基づく計算であり、provider内部カウンター・429不発を保証しない。
6. 日次は直近24時間の既知usageを保守的に集計する。日付が変われば証拠を更新する。旧実3729は旧保持6000に一度だけ包含し、別の既知予算拘束8000などを消去しない。この例では旧6000＋別拘束8000＋新予約8000＝22000。保持予算は現在分間消費とは区別する。8000以上の実使用行はこの限定経路で拒否する。
7. 既存RPM/RPD/TPM/TPD、split/project判定を実行し、既存の同一永久claim・送信前永続予約・transport・非公開結果保存へ渡す。送信直前にも証拠期限/clockを再確認する。

この方法の信頼境界は既存と同じ「operator secretで認証された管理者の証跡」である。管理外callerを技術的に停止したとは主張しない。共通台帳を全callerに強制するには本体/Productionへの適用が必要で、今回の禁止範囲につき実施しない。装飾的なグローバルlockを置いて本体も保護されたとは表示しない。

## 入力証拠と既存APIへの接続

既存`snapshot`の5キー、grant、inputProof、account、isolationを維持する。新規`capacityProof`は`{kind:'exclusive-ledger-window-v1',validUntil,ledger}`。`ledger`には次を格納する。

- `completeOrganizationInventory:true`, `allCallersReconciled:true`, `unresolvedRequests:0`, `unresolvedReservations:0`：管理者が記録に基づいて確定した場合のみ設定する。Workが推測で作成しない。
- `coverageStart/coverageEnd/reconciledAt`：UNIXミリ秒。coverageStartは実行時刻の24時間以上前、coverageEndは停止区間開始以後。完全照合できた最終送信時点であり、画面の取得時刻に置き換えない。
- `reference/confirmedBy/pendingCheckReference/callerReferences`：監査原本と、production/preview/actions/local-cli/other-playgroundの各送信元記録の参照。
- `requests`：`{requestId,caller,httpStatus,sentAt,completedAt,terminalResponseConfirmed:true,usage:{prompt_tokens,completion_tokens,total_tokens},reference}`。途中のreasoning、秘密値、エラー原文を入れない。失敗詳細は既存HTTP観測経路で扱う。
- `retainedHolds`：`{kind:'retained-budget-hold',id,tokens,requests,reference}`。これは保持予算であり、不明通信を終了扱いにする機能ではない。旧Request ID/attempt IDや他の実使用行と重複できない。
- `isolation`に`windowStartedAt`, `noSendsSinceWindowStart:true`と各callerの`pausedSince`を追加する。元の全停止/期限/receipt一致要件も維持。

新しい`preflight-free-calibration` actionを既存operator認証で利用できる。推論flag無効のまま旧Private Blobと新claimを読み、実行SHA・wire・入力・全容量条件を検査する。claim/予約を作成せず、Groq keyも使用しない。200は`preflight_passed_not_send_permission`であり実行成功ではない。送信時にも同じ検査を繰り返す。

参照専用preflightは新実通信承認より前に実施できる。専用actionのサーバー側でのみ`readOnlyFacts`を指定し、grant/risk承認を事実検査の前提にしない。200にも`executionApprovalStillRequired:true`を返す。実行action/runner/transportではこの設定を受け取らず、新SHAの明示承認・残余リスク受容・有効期限を引き続き必須とする。投稿bodyに同名flagを付けても実行条件は緩和されない。

`preflight-readonly.cjs`は既存のruntime operator secretと短命OIDCを環境内だけで使い、同一SHAの隔離PreviewのHTTP参照/preflightだけを検証する。Groq keyの取得・表示、execute要求、flag有効化は行わない。`URENAVI_PREFLIGHT_TARGET`を当該Preview branchだけに一時設定してbuildで実行し、検証後に解除する。対象未指定時は送信しない。実データ不足を412、認証不一致を403として確認し、旧台帳と新claimを前後比較する。これは不足条件での実環境拒否検証であり、管理者の台帳/排他成立や容量合格の代用ではない。

算出根拠・Request ID/usage一覧・証拠hashを新claim/校正台帳に保持する。任意の入力プロパティは監査記録に転記せず、reasoning等を保存しない。旧claim/HTTP/校正/receiptを変更しない。

## 次回に残る操作

1. 管理者：本体/Preview生成を行う全端末・利用者、CLI、Playground、手動Actionsを停止し、継続排他区間を指定。開始済み処理の結果を照合。既存Actionsはオフライン検証であり、本番送信抑止をActions成功だけで代用しない。
2. 実行担当：監査原本を使って上記ledgerを作成し、現アカウント/Project/split制限を読み取る。未知・欠落があれば埋めず停止。完全な全送信監査と排他が作れない運用なら、この方式は使えず本体の共有ゲート導入を別途承認する必要がある。
3. ユーザー：今回変更後のSHAについて最大1通信と既存残余リスクを承認。旧SHA承認を流用しない。
4. 実行担当：新SHAを隔離Previewへ推論無効で配備。既存operator認証でread-only preflight実施。全条件合格後だけ同一SHAのFree flagを有効化し、既存execute-free-calibrationを1回実行する。認証を迂回/変更しない。失敗・不明結果後は再送しない。

これは追加実測の承認依頼を兼ねない。現在の実運用の排他・台帳完全性をこの修正や模擬テストの成功から成立済みと扱わない。

## 通信なし検証

2026-11-07：network/credential guard付き中核410件、既存回帰454件、合計864件成功・失敗0。新規37件は完全台帳/未処理/排他/60秒境界/日次境界/split/SHA/claim競合/保存失敗/read-only preflight/400/429/非公開を検証。固定wireHashと9791bytes不変。旧Private Blobへの書込み、Groq推論、通常本体経路変更、実行flag変更は実施していない。新APIの実Preview検証と現運用の証跡収集は別途必要。
