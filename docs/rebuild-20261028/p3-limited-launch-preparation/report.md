# P3-B初回1通信・限定実測への移行準備
2026年10月29日（日本時間）

## 1．開始・終了状態
開始HEAD：edc81f0aead9dbad6db485e3d2e4582fc2e1bcf5
Branch：rebuild/urenavi-core-20261028。開始時クリーン。
終了HEADは本報告を含むローカルコミットの完全SHAをユーザーへ記載。既存証拠は開始HEADとバイト比較し一致。過去の文章品質評価も保持。

## 2．今回進めた実装
1000候補をpayload比較だけの状態から、既存runner→admission→transport→usage検査→両台帳照合の経路へ接続した。新しい生成器・安全基盤・AI工程はない。

- chat-wire.js：元の凍結3000wireに完全一致する入力だけを受け、出力1000にする校正専用compile関数。通常compileRequestは3000のまま。応答検査は校正時のみ1000を上限とする。
- admission.js：初回single予約に限り1000出力を指定可能。通常singleの既定値/通常4工程before/preflightは3000のまま。校正は入力仮予約5000＋出力1000＝6000を確保し、RPM/TPM/日次/project/splitを既存式で確認。
- calibration-runner.js：first-call-1000 profileだけを追加。推計予約を保証上限と偽らないlimited-experiment-estimateとproviderBoundCertified=false、uncertaintyAcknowledged、専用grant種別を明示する。通常の仮想境界とは区別し、wire hashとsnapshot hashを記録。
- isolated-transport.js：profileを受けて同じ校正wireを構築。draft以外を拒否。1000のusage検査を適用し、既存送信前記録/redirect禁止/timeout/retry0/保存停止を維持。

通常原文/schema/medium/3000、外部契約/拒否条件/品質基準は不変。受け取る入力は元の凍結wireと一致必須で、別商品や指示変更には使えない。1000校正応答を通常ROOM結果へ公開する経路はない。

## 3．固定した初回条件
商品：yukaiya:10001267（洗濯ネット6枚セット）
原文hash：1b142873671ba6906329a4217cc8c5a2811feba46c3fa27fdefcbd8ac2854c91
校正wire hash：351242d9c86b14994760b18621496db1f195f9d1f657db6317bb40f3062648b4
通常wire hash：ab9f962665d02755d3e2fc683969472466e2da2964e7ce0cb7a13aa3d872d053
model：openai/gpt-oss-120b、medium、strict schema、出力1000、1通信。

原文/schema/指示は同一で、出力上限だけが異なる。元3000wireの許可は1000wireへ流用不可。1500/2000は今回接続していない。

## 4．実アカウントと現在残量
確認済み上限設定：Personal/Default Project、RPM30/TPM8000/RPD1000/TPD200000、project独自制限なし。
今回、新たな認証済み管理snapshotは取得していない。
ITPM/OTPM有無と値、直前共有消費、現在残量、reset、他caller停止、未解決送信解消、snapshot日時/有効期限、専有終了は未確認。launch-plan.jsonへnullとして記録。0/無制限/停止済みにはしていない。

必要な非秘密確認は既存確認票を使う：
1. Organization LimitsのTPM hoverでsplit有無/値。
2. Usage/Metrics/Logsと全caller管理記録で、UTC期間・遅延込みの直前消費/未完了予約/未解決送信を照合。
3. Production/Preview/Actions/CLI/開発server/Playground等について実停止/既存処理完了を確認。project1件をcaller1件としない。
4. snapshot日時・有効期限・排他期間・管理host/canonical journalを確定。実枠から既存消費/予約を引いて1requestと計画予約を確認。
今回は本番停止/設定変更をしない。秘密値も読まない。

## 5．消費の報告と残る不確実性
通信数上限：1request（手動再送・自動再送とも行わない）。
出力上限：1000。推論と最終JSONで共有。
入力の計画予約：5000。
最大想定の計画消費：6000 tokens。
保証された最大総消費：不明。6000はproviderの保証上限ではない。

可視component2527は参考計数で、provider入力上限にはしない。provider追加計上/受付時計上が未確定なので、実usageが6000や入力5000を超える可能性を排除できない。応答後の超過検知は、その送信の既発生消費を取り消すものではない。

今回の方針は、完全な事前保証があるとするのではなく、provider推奨の小規模1回校正を限定実験として準備すること。providerが提供しない保証APIを再調査したり同じtoken計数を繰り返したりしない。実際に不確実性を伴う送信を行うかは、上記の未確認事実と消費限界を提示した後の別明示承認で判断する。

## 6．停止条件と校正情報
送信前：未確認値/期限切れ/別wire/許可違い/既存pending/予算不足/他caller停止未確認で停止。
送信後：429、timeout、不明usage、予約超過、保存失敗、台帳不一致、未完成で停止。自動retry0。usage不明時に予約を解放しない。
正常応答も1回で停止してhold。審査/書直し/別商品/3000の試行へ自動移行しない。
lengthでJSONが中途でもreported usage/reasoning内訳が返ればHTTP台帳へ記録する。今回runnerはそれを通常完成として返さず、未解決holdとする。usageが返らない場合は校正値不明のまま保持する。
出力本文/ROOM文章は返さず、取得しても校正のusage等だけを扱う。

1000の校正成功から、通常3000の容量・完成率・文章品質は認定しない。3000との同一入力数もprovider保証ではないため、その限界を残す。

## 7．検証
今回追加10ケースは1000接続で変わる境界だけ：wire不変/6000予約/1000usage上限/旧wire許可拒否/別source拒否/不確実性認識必須/保証偽装拒否/共有枠不明/専有不明/中途JSONのusage保持。既存の429/timeout/保存失敗等は既存試験を利用し重複追加しない。
新版225件成功、既存回帰454件成功。合計679成功、失敗0、skip0。全て通信guard下で実行。

## 8．開始可否と承認前の境界
1000の実行ロジックは隔離環境で接続・検証済み。ただし実通信開始は不可（直前事実未確認・承認なし）。
今回の実通信禁止に従い、runner/transportはoffline guard必須かつoffline-test-only許可、モック認証のみを維持している。実認証の取得やlive接続の有効化はしていない。したがってこれは「今すぐliveへ送れる」との報告ではない。
残る実行前作業は、非秘密snapshot/専有/未解決解消の事実確定、選定hashの1通信に対する明示承認、その承認範囲での実認証接続の有効化。現在のsample grantやnullのlaunch-planは実許可ではない。承認時に通常3000へ切り替えたり、入力の推計を保証値へ格上げしたりしない。

## 9．影響
実Groq推論0、DB接続/書込0、秘密値読出0、main/Production/決済/本番依存/通常出力/契約/拒否条件変更0、push/PR/deploy0、旧版再生成0。
同じ容量調査・トークナイザ再計数なし。通常生成品質改善・無料枠運用成立・完成は宣言しない。
