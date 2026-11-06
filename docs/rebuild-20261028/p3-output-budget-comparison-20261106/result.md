# 出力予算比較・通信なし準備（2026-11-06 JST）

開始HEAD: 443b73b44bda20686f87863d9aff9116a831bd11。追加Groq通信0。

## 比較と仮説

`plan.json` は元wireを複製し `max_completion_tokens` のみ1000→3000にした未送信候補。商品yukaiya:10001267、120B、medium、messages、Schema、strict=trueは同一。元wireを変更しない。新hashは ab9f962665d02755d3e2fc683969472466e2da2964e7ce0cb7a13aa3d872d053。これは以前の未送信3000準備wireと同一であり、初めて登場したpayloadとは称さない。比較実験IDと元1000hashを別途固定して識別する。

仮説A: reasoningを含む出力予算不足。以前のcompletion=1000は上限一致だが途中JSON不明、未確定。出力上限のみの変更はこの仮説の比較に適する。成功はその条件での取得証拠であり原因の完全確定や全商品品質保証ではない。
仮説B: providerのStrict制約適用/実装挙動。公式は120BのStrict対応とSchema準拠を保証する一方、400の再現情報を求めてもいる。今回の400は公式説明との見かけの不一致。backend不具合とは断定しない。新しい安全な観測記録が必要。
仮説C: Schema subsetの受理/制約。writer18objects/86properties、全required/閉鎖object、文書記載の型は適合。min/max長・配列数・数値範囲の当該backend適用と1000制限時挙動まで通信なしでは証明しない。Schemaやプロンプトを同時変更しない。

## 予約と停止

新候補は入力5000＋出力3000＝8000。入力枠は前回観測2729に対して2271余裕を維持する実験的見積りで、provider上限証明ではない。8000枠外の追加余裕0、確認済みTPM8000に対する名目余裕0。前回3729の内訳は入力2729・出力1000。今の消費や残量とは扱わない。

前回の未精算6000は3729を包含する。新枠8000との保守的拘束は14000であり、同じ要求に3729をもう一度加算しない。旧snapshotの別履歴控除8000を維持する条件例では日次拘束22000。これは現在使用量の観測ではなく帳尻の例。未確認使用量を0にしない。現時点の枠を実予約したわけではない。

前回の永続claim・unreconciled・pending・reserved6000を一切編集しない。別claimパス案は元prefixと独立しcreate-onlyだが、組織横断のゲートを必須とする。新しい空台帳で旧pendingを隠すことは禁止。既存ゲートは旧台帳でcalibration_ledger_halted、pendingを直接検査するとunreconciled_sendで拒否。待機や日次resetだけでpendingを失効させない。新claimを実作成せず、許可・スナップショットはnull、liveはHOLDのまま。既存live経路は1000専用で新hashを拒否することも確認。

## Preview確認（今回の読み取り）

Deployment dpl_6hzVRQiCrY5jLNmacLCFP9s9ZLeQ、READY、target=null。
実行SHA 36c961e9e9b45e3e865856b1a4c67a809c6d2f66。
2026-11-06 20:45 JST、認証付きGET /api/calibration は200、maxCompletionTokens=1000、inferenceEnabled=false、publication=false。GETからGroqは呼ばない。443bの観測修正はこのPreviewに未配備。今回配備・環境変数変更なし。private台帳の今回の新規読戻しはしていない。前回journals-readbackを現在値と偽らない。

## 検証

通信遮断下: 中核267＋既存回帰454＝721成功、失敗0/skip0。16件の比較専用テストを追加。単一変数/hash、旧証拠不変、新claim未作成、8000境界と7999拒否、共有使用1token追加拒否、RPM/RPD/TPD/project/split境界、期限切れ、unknown消費、旧halt/pendingの停止、旧live許可の新hash拒否を確認。既存400観測・自動再試行なし・未完成文公開防止・永続claim回帰も再実行。Mockの呼出しは実Groq通信数に含めない。

## 次回の具体的な解除工程

1. 管理者がGroq Consoleの対応Request ID/日時/2729+1000を照合し、全送信経路の完了・未処理要求の有無と現在のLimits/Usage/resetを確認する。取得できない完了/残量情報はGroqサポートへ照会（こちらからの連絡未実施）。前回の停止確認を新しい確認として流用しない。
2. 旧6000/claim/unreconciledを保持する条件では、現行ゲートは次の通信を許可しない。予約解放や旧記録を書き換えずに進むには、対応要求の終端/消費が確認できたことを不変の照合証拠として別途扱う方式の承認と実装審査が必要。現行コードにその機能があるとは報告しない。管理者の「実行承認」だけではこの停止は解除できない。
3. 安全証拠が成立した後、Workが観測修正を隔離Previewへ反映し、比較専用の許可/独立claimと組織全体の予約検査を接続する。今回は既存live経路/ゲートを変更せず、実行可能化しない。
4. ユーザーが新hash・3000上限・再計算予約・最大1通信を明示承認。新しい全caller停止と期限内snapshotを取得。旧拘束と未知消費を含むRPM/RPD/TPM/TPD確認を満たさなければ送信しない。

結論: 比較payloadとオフライン検証は完成。現在の安全条件は未成立、実行不可。追加承認だけで直ちに実行可能とはしない。main/Production/決済/DB/RLS/認証仕様・生成器・prompt・元wire・旧claim/予約に変更なし。

公式照合: https://console.groq.com/docs/structured-outputs / https://console.groq.com/docs/reasoning （2026-11-06取得）。
