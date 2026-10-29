# 初回1通信の非秘密Console確認票

実施状況：未確認。Consoleへの認証済みアクセス・caller停止は今回行っていない。
対象：openai/gpt-oss-120b / Chat Completions。API Keys、環境変数、認証headerは開かない・収集しない。

各行に「確認したorganization/projectの非秘密な識別」「取得値」「確認日時（タイムゾーン付き）」「確認者」「根拠画面」「有効期限」を記録する。空欄は0ではなくunknown。

| 操作画面／操作 | 取得値 | 確認日時 | 判断条件 |
|---|---|---|---|
| Consoleのorganization選択→Organization Limits、対象モデル行 | RPM/TPM/RPD/TPD、モデル使用可否 | 未確認 | 実アカウント値。公開表を転記しない |
| 同じモデルのTPMへhover | ITPM/OTPM有無、各上限 | 未確認 | breakdown非表示を確認した場合だけ「分割なし」。未閲覧はunknown |
| Settings→Projects→対象project→モデル別rate limits | 独自RPM/TPM/RPD/TPD、継承の有無 | 未確認 | 独自値と組織上限の両方を守る。継承も画面確認が必要 |
| project選択→Dashboard→Usage/Metrics/Logs | 当日request/token、直近minuteの消費、最終request時刻、集計期間・遅延 | 未確認 | 5分rateや月額spendをそのまま残minute/日次tokenに変換しない |
| 他projectへ切替し同期間を確認、管理者の全caller記録も照合 | 組織全体の実消費・予約・未解決送信 | 未確認 | 対象projectだけの消費では不足。他用途不明なら停止 |
| Limits/reset表示、既存非秘密rate記録 | minute/day reset、時刻・timezone、補充方式 | 未確認 | 過去response headerを現残量としない。remaining-tokensはTPM、remaining-requestsはRPD |
| 各callerの制御画面／運用担当者の確認 | Vercel呼出、Actions、CLI、notebook、playground、他サービス等の一覧・停止時刻 | 未確認 | 実停止確認とin-flight終了/不明送信照合が必要。今回は停止操作しない |
| 校正実行者の共有記録 | canonical journal絶対パス／管理host、保留予約、排他期間、他caller復帰条件 | 未確認 | 同時runnerなし、別directory/別hostの迂回なし、hold解除まで他消費なし |
| 送信直前の再確認 | snapshot日時・validUntil、全上限から確定消費/予約を引いた利用可能量 | 未確認 | 1request、provider込みの根拠あるinput上限＋output3000を全枠で確保 |

日次残tokenやresetがConsoleだけで確認できない場合、グラフから推測せず管理者集計または公式窓口で確認する。snapshot有効期限は、確認済み排他期間・確定reset・情報更新期限の最も早いもの以内とする。任意の「5分なら安全」等は設定しない。

## 初回専有の成立条件

1. 全organization内の対象モデル消費callerを把握する。projectを分けるだけでは組織枠は専有できない。
2. 承認された運用担当者が校正時間帯に他callerを停止し、その事実を記録する。今回の作業は本番操作禁止のため、この停止は実施していない。
3. 既存in-flightと未解決送信を照合。未解決usageや予約は消去しない。解消しなければ開始不可。
4. providerのminute回復を根拠付きで確認し、日次消費は引き継ぐ。「停止後60秒だから全部0」は不可。
5. 1回専用runnerのcanonical journalを指定し、別実行環境を使わない。snapshotとpayload hash、専有期限を束縛する。
6. 成功・429・timeoutいずれでも1回で停止。共有枠のholdを維持し、operatorが両台帳とprovider記録を照合してから他callerを復帰する。

この方式は共有消費の競合を解消し得るが、provider入力上限の未確認を代替しない。
