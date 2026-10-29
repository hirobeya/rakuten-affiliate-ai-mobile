# P3-B 初回実認証接続の限定実装結果

## 1. 開始・終了

開始HEAD: d01983d7b9090c8089cd498c4348f6f4e102d364
Branch: rebuild/urenavi-core-20261028。開始作業ツリーclean。
終了HEADは本報告を含むローカルコミットのSHAを最終回答に記載。過去証拠は保存済みのまま保護。

## 2. 実認証接続の実装

- calibration-runner.js: 既存runに明示的なlive-calibrationモードを追加。通常既定はofflineのまま。1000の固定wire、条件付き許可、確認済みsnapshotと専有記録を必須化。専用の固定保存先を使い、送信前永続化・一回停止・両台帳照合を再利用。
- admission.js: single予約だけlive-calibrationを明示指定できるよう変更。通常engineのvalidate/plan/preflight/beforeは引き続き既定offline。RPM/TPM/日次/project/splitの既存式は変更なし。
- isolated-transport.js: 認証callbackを送信直前に呼び、Authorizationを固定Groq endpointにだけ渡す。redirect禁止、retry0、timeout/usage/保存失敗停止を再利用。実モードは検証済みcontext・同じsnapshot hashを持つ永続capacity台帳がなければ直接利用できない。
- live-calibration.js: 専用モードの小さな条件検査とruntime環境の認証注入。秘密値はjournal/result/errorへ出さない。任意provider/商品を扱う新基盤ではない。
- run-first-live-calibration.cjs: 管理者用の1回CLI。非秘密snapshotを読み、固定商品だけ実行。envファイルの自動読込・DB・Console内部token利用・文章公開なし。
- HTTP結果・usage・reasoning内訳（providerが返したとき）とallowlistのrate/reset headerを保存。ヘッダー欠落を0にしない。未完成JSONでも安全に取得できたreported usageは保持し停止。

## 3. 実行前条件の確認結果

Personal / Default Projectの認証済みConsoleは前段で直接確認済み。RPM30/RPD1000/TPM8000/TPD200000、project独自制限なし。
今回対象TPMセルのポインター補足は8,000だけを表示し、ITPM/OTPM適用・値は確定できなかった。
Today使用データなしは最大15分遅延の注意付き。現在のminute/day残量とresetやin-flight不存在の証明には使わない。
他caller停止、共有残量、未解決通信/予約解消は未確認のまま。snapshot templateの該当値はnullを維持し、0/無制限/停止済みに補完しない。

Vercel env-vars skillに従いconnectorをdecrypt=falseで照会。GROQ_API_KEYのproduction/preview設定を各1件確認、いずれもsensitive型。値の取得・出力・保存なし。
現在のWorkプロセスにはGROQ_API_KEY未注入（booleanのみ確認）。既存Vercel secretを既存deploymentからこのローカルprocessへ安全に渡す実行経路は確認できない。取得・deploy・本番変更で代替しない。
コード上の実認証経路は実装・オフライン検証済みだが、実キーを注入した実接続は未確認である。

## 4. 通信回数

実Groq推論: 0回。安全条件不足のため、実認証による疎通確認も送らなかった。
通信回数を消費する認証試験・/models試験・Playground代替・429再試行なし。
管理APIの設定metadata照会、Console UIの読み取りは行った。

## 5–7. 実測値

HTTP結果: 未送信のためなし。
実prompt/completion/reasoning/total tokens: 未取得。
事前推計との差: 算出不可。
固定1000wire hash: 351242d9c86b14994760b18621496db1f195f9d1f657db6317bb40f3062648b4。
入力計画予約5000 + 出力1000 = 6000。provider追加計上を含む保証上限ではない。可視component2527をprovider prompt数と同一視しない。

## 8. 台帳と検証

新版229 + 既存回帰454 = 683件成功。失敗0、skip0、cancel0。
新規4テストに、未確認条件/各caller/期限/wire等の拒否、成功/429/timeout/unknown/超過/未完了/認証失敗/保存失敗の一回停止、直接transportのcontext欠落、永続台帳改変時の送信阻止を含めた。
全テストはenvを消去し、offline guardまたは既存回帰network guardで実通信を遮断。実モードの試験も架空credentialと注入HTTPであり、実認証成功の証明ではない。
新規テストは固定保存先が事前に存在しない場合のみ、合成台帳を一時作成して後片付けする。既存実attemptがある場合は触らず失敗する。今回終了時に実校正stateディレクトリは存在しない。
合成成功例でcapacityとHTTPの同一attempt/hash/usageを照合、未使用予約hold、正常後停止、reasoningと数値header保存を確認。実台帳/実usage/実残量の整合は未送信のため未検証。

実行コマンド:

```bash
./scripts/rebuild/offline.sh --test tests/rebuild/*.test.js
./scripts/rebuild/regression.sh
```

## 9. 通常3000への移行

不可。初回校正が未実施。実施成功後も1000校正だけで通常3000の容量・JSON完了率・文章品質は合格にしない。
通常3000、原文、schema、medium、外部契約、拒否条件、品質基準は変更していない。

## 10. 次の具体的作業

実装の不足として残っていた認証付き送信経路は今回追加した。残りは以下の運用接続であり、同じtokenizer調査や追加モックでは解消しない。

1. 信頼できる実行ホストへ管理者が既存Groqキーを非表示で注入する。チャットやsnapshotにキーを書かない。既存Vercel secretしか利用できない場合、今回禁止のdeploy/本番変更なしに使えるホストが必要。具体的な実行コマンドはoperator-steps.md。
2. 非秘密snapshotのITPM/OTPM、直前共有消費/reset、未解決解消、全callerの停止事実を確定。account-snapshot.template.jsonのnullを根拠なく埋めない。
3. 成立後は引継ぎ済みの条件付き承認で同じCLIを1回実行。再承認を目的化しない。不明・失敗・完了ともhold。
4. 実usageと両台帳の整合を確認し、通常3000の容量検討と、その後の承認範囲での文章品質実証へ進む。今回品質評価は実施していない。

main/Production/決済/DB/RLS/既存本番コード/push/PR/Preview/deploy/旧版実再生成への操作なし。Vercel設定・APIキー発行/変更なし。
