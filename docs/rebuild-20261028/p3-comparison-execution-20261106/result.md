# 比較専用実行経路の実装・安全審査

基準HEAD: 07244e69daffeeca27f12a948b3846956d73c103。追加Groq通信0。元1000wire、Schema、prompt、reasoning、商品sourceは不変。新しい文章生成器なし。

## 完成した経路

隔離API `execute-comparison` → 旧Private Blob台帳＋精算証跡の非キャッシュ読戻し → `comparison-policy` → 独立create-only claim → 新校正台帳へ8000予約 → 既存`contracts.request`と`isolated-transport`でdraft1回 → 非公開の未審査candidate保存。通常UI・コピー・公開・後続review/rewriteへは接続しない。

固定wireHash: ab9f962665d02755d3e2fc683969472466e2da2964e7ce0cb7a13aa3d872d053。
実験ID: db7b2b6a471efa3e5590820cab3f20b4f4a5b720ad4103985a4328bec9b87d71。
claim prefix: `urenavi-output-budget-comparison/<experimentId>`。旧`urenavi-first-call/<oldHash>`と独立。claimの期限切れ・削除・上書き・再作成なし。配備や再試行では再送できない。実験IDを任意に変える入力も受け付けない。

秘密値は送信直前に既存環境認証関数から取得。比較専用live経路でもglobal fetch以外へのHTTP差替えは通信遮断テスト中のみ。旧1000のlive許可は新hashへ流用不可。新grantはユーザーの新しい明示承認・hash・実験ID・上限3000・予約5000・旧精算hash・1回・期限を全て要求する。投稿bodyやqueryではruntime armingを有効化できない。

400詳細は既存の秘匿・reasoning除去済み観測処理を再利用。429は本文待ちなしで停止。timeout、不明usage、予約超過、保存失敗、Schema不適合、期限切れは停止。自動再試行なし。成功でも本文はAPI応答へ返さず、private校正台帳にunreviewed/publication=false/copyable=falseとして保存する。認証されたinspect-comparisonのみで操作者が審査資料を取得できる。

## 旧証跡の容量統合

`failed-calibration-reconciliation.verifyReceipt`で旧3記録と精算証跡を一致検査。未精算記録を隠した空台帳では実行不可。旧6,000は組織とProjectの日次判定へ各scopeで一度ずつ加える。旧実消費3,729を追加加算しない。その他日次使用は旧Request IDを除く明示的な内訳と合計を照合し、ID重複・未知値を拒否。別履歴8,000が残る例では8,000＋旧6,000＋新8,000＝22,000の日次拘束。

旧分間拘束の扱いは「既知の終了」を証明する旧receiptに限定。終了確認から60秒未満は停止。60秒経過後も、組織全体・Project・全callerを含む現在容量・未処理ゼロ・reset証拠・排他確認が無ければ停止。現在のその他分間使用はゼロと推測せず、既存RPM/RPD/TPM/TPD/split/projectゲートに渡す。Usage画面の15分遅延などは現在容量の証明として拒否。観測時刻とデータ時刻・最大遅延を区別し、送信直前にも期限を再検査する。

## 出力予算の結論

ローカルo200k_harmonyでliteral messages＋response_formatの成分和2527、HTTP JSON全体2579。実測prompt2729は以前の観測値。いずれもproviderのtemplate/schema展開・rate admission計算を含む厳密上限ではない。過去2729に対する入力予約5000の余裕2271は実験的余裕であり、上限保証ではない。

3000案: 5000＋3000＝8000、名目分間余裕0。完全なprovider入力上限とrate accountingを含む5000以下の証拠、かつその他分間使用0が必要。現在その証拠は未取得で、安全審査未合格。
2500案: 5000＋2500＝7500、名目余裕500。入力予測の不確実性は残る。500を入力側へ移して5500を予約する案でもproviderの上限保証を自動取得したことにはならない。可視成分2527から未知の追加分Uを置くと、完全idleの8000内には3000案でU<=2473、2500案でU<=2973が必要。ただし入力5000予約を維持する限り両方ともU<=2473の証明が必要。

結論: 第一候補3000を維持。2500は別hashの比較資料のみで、実行経路は拒否する。予算の無断変更なし。入力根拠kindがlimited-experiment-estimateのままでは新経路は通らない。provider-input-upper-boundの名称やbooleanを付ければ証明が得られるわけではなく、操作者は実在する根拠をsource/referenceで照合する必要がある。現在はその根拠がないため実行しない。

## 検証と配備

通信遮断下の中核・既存回帰テストを実施。境界8000/7999、追加1token、日次旧hold、精算欠落/改変、claim独立/CAS/重複、400/429、保存失敗、未完成JSON、期限切れ、遅延Usage、旧許可流用不可、生成結果非公開を含む。実通信の品質合格ではない。

隔離configはURENAVI_CALIBRATION_LIVE=disabledとURENAVI_COMPARISON_LIVE=disabledを固定。推論無効のPreviewへ配備し、最終回答に実行SHAとGET実測結果を記載する。build時の旧精算読戻しは既存のidempotent検証を維持し、旧台帳・claim・予約を変更しない。

残条件は、入力上限/rate accountingの実在する根拠、現在の組織全体容量と未処理照合、全caller排他、新しい1通信の明示承認、承認に対応する比較runtime arming。コード・接続の追加設計を実測の前提として残していない。protected main/Production/決済/DB/RLS/認証仕様は変更しない。
