# Free限定校正：観測可能な証跡による実行条件

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

算出根拠・Request ID/usage一覧・証拠hashを新claim/校正台帳に保持する。任意の入力プロパティは監査記録に転記せず、reasoning等を保存しない。旧claim/HTTP/校正/receiptを変更しない。

## 次回に残る操作

1. 管理者：本体/Preview生成を行う全端末・利用者、CLI、Playground、手動Actionsを停止し、継続排他区間を指定。開始済み処理の結果を照合。既存Actionsはオフライン検証であり、本番送信抑止をActions成功だけで代用しない。
2. 実行担当：監査原本を使って上記ledgerを作成し、現アカウント/Project/split制限を読み取る。未知・欠落があれば埋めず停止。完全な全送信監査と排他が作れない運用なら、この方式は使えず本体の共有ゲート導入を別途承認する必要がある。
3. ユーザー：今回変更後のSHAについて最大1通信と既存残余リスクを承認。旧SHA承認を流用しない。
4. 実行担当：新SHAを隔離Previewへ推論無効で配備。既存operator認証でread-only preflight実施。全条件合格後だけ同一SHAのFree flagを有効化し、既存execute-free-calibrationを1回実行する。認証を迂回/変更しない。失敗・不明結果後は再送しない。

これは追加実測の承認依頼を兼ねない。現在の実運用の排他・台帳完全性をこの修正や模擬テストの成功から成立済みと扱わない。

## 通信なし検証

2026-11-07：network/credential guard付き中核410件、既存回帰454件、合計864件成功・失敗0。新規37件は完全台帳/未処理/排他/60秒境界/日次境界/split/SHA/claim競合/保存失敗/read-only preflight/400/429/非公開を検証。固定wireHashと9791bytes不変。旧Private Blobへの書込み、Groq推論、通常本体経路変更、実行flag変更は実施していない。新APIの実Preview検証と現運用の証跡収集は別途必要。
