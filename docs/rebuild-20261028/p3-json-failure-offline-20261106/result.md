# 初回JSON失敗・通信なし調査

基準HEAD：9c170b3b7789fde1783dca0b51c4cfbbd09650bc。
追加Groq通信0。固定wire351242d9c86b14994760b18621496db1f195f9d1f657db6317bb40f3062648b4不変。永久claim・6000予約・既存実測証拠を変更していない。DB/RLS/認証/Production/決済変更なし。

## 確定事項
実測は入力2729、出力1000、HTTP400/json_validate_failed。当時のwireはjson_schema・strict=true・medium・max_completion_tokens=1000。現在の公式資料では120BはStrict/Best-effort両対応。Strict未設定説は否定される。全writer18 object/86 property、review20 object/94 propertyは全項目required・additionalProperties=false。ローカル静的要件適合は確認したが、Groq実装の全subset受理・制約適用まで通信なしで証明したとは言わない。

## 未確定事項
failed_generation、finish_reason、reasoning内訳が取得できていない。どの構文・フィールドが違反したか、出力上限による途中切れか、provider側Strict実装の例外かは確定できない。1000上限到達は確定、直接原因としては仮説。
ローカルo200k_harmonyで架空ケトル1文fixtureのJSON715tokens、plan594tokens。最小長の形状サンプル355tokensもSchema通過するため、Schemaだけで1000以内を数学的に不可能とは言えない。これらは実商品出力・provider reasoning量の予測ではない。

## Schemaと文章品質
planの所有者・scope・引用・関係・bindingsを保持する構造は現行の意味安全性に必要。Strictは型保証であり購入理由・自然さ・根拠外0の保証ではない。既存inspect/reviewの拒否ゲートを維持。プロンプトは1〜3文、Schemaは1〜4文を許容する差を記録。1〜3文はSchemaに収まるため今回400の確定原因とはせず、凍結契約を変更しない。min/max長・数値範囲はローカルでも引き続き拒否判定。

## 限定修正
HTTP400を捨てる前に安全なエラー観測を永続保存。status/code/type/message/param、取得できたrequest ID、整合したusage、失敗分類を許可リストで記録。任意のproviderフィールド・既知Bearer値・APIkeyパターン・reasoning/analysisフィールドと明示マーカーを除去。failed_generation提供時は許可されたcandidate JSONを秘匿・reasoning除去後に保存し、元データそのままではないことを明示。
不完全JSONなど安全にreasoningを分離できない文字列は本文を保存せず、提供有無・構文失敗分類・byte数のみ記録。非JSONエラー本文もそのまま保存しない。使用量欠落はnullであり0にしない。エラー観測は公開/コピー用のresponseへ昇格させない。
429はエラー本文を待たず停止。観測保存失敗はlock保持。timeout後の遅延400本文は停止台帳を上書きしない。成功時のfull journalも専用reasoningと許可外フィールドを除去し、実際にengineへ返すcandidateは変更しない。元のresponse_format/Schema/strict/上限/reasoning設定/プロンプト/生成器/予約規則は不変。

## 検証
中核251成功＋既存回帰454成功＝705成功、失敗0/skip0。通信遮断下。400保存、1000到達模擬、不完全JSON拒否、secret/reasoning除去、使用量未知、429即時停止、保存失敗lock、遅延応答、重複防止、private claim既存試験、固定wireハッシュ保全を含む。実測済み失敗の消費を今回再度推論したものではない。

## 次回
生成本体は原因未確定のため変更しない。観測修正版を使う新しい実験の明示承認が必要。既存claim再使用/削除と予約強制解放は禁止のまま。上限1000→3000だけを変える比較は、原因仮説を検証する別wireの案であり、採用済み修正でも成功保証でもない。実施には新wire/hash・新しい独立台帳/claim・新出力予約と組織残量・共有送信抑止を明示承認してから準備する。今回は未実装・未実行。

## 公式照合元
https://console.groq.com/docs/structured-outputs
https://console.groq.com/docs/reasoning
https://console.groq.com/docs/api-reference
参照日2026-11-06。公開資料は現在仕様であり過去backend挙動の直接証拠ではない。
