# 初回Groq実測：実行環境への認証接続の確認

## 結果
実Groq推論0回。開始HEADはd959ad7aa87fe623a8d573d65229552e8ae6a46e、branchはrebuild/urenavi-core-20261028、開始時clean。
認証情報未注入と直前の共有枠・専有未確認のため、runnerは起動せず送信していない。コードを変更せず、同じテストを再実行していない。

## 今回行った実行前確認
- 環境変数GROQ_API_KEYの存在だけをbooleanで確認し、false。値を取得・表示・保存していない。
- runnerの固定保存先p3-first-live-stateは不存在。capacity/HTTP journalと両lockも不存在。これはこのcheckoutの事実であり、他host・別cloneの送信不存在を証明しない。
- 利用可能なtoolを確認したが、このWorkプロセスへ非表示でsecretを注入する専用toolは見つからない。Work全般にその機能がないという主張ではない。
- Vercel Sandbox作成/コマンド実行のschemaはenvへ値を渡す方式。既存projectのsecretをsecret参照だけでこのprocessに渡す指定は確認できない。利用できるか未確認のSandboxを作成して時間・費用・secret露出を増やす操作は行わない。
- 前回確認したProduction/Previewのsensitive型設定は継承情報であり、今回再照会・復号していない。
- Consoleへの認証済みsessionは推論API keyではない。session tokenの抽出・Playgroundでの代替送信はしない。

## 未解決と必要な操作
1. **認証の接続**：管理者が既存キーを保持している場合、このcheckoutを実行する信頼できるホストのGROQ_API_KEYへ非表示入力またはsecret管理機能で注入する。既に注入された実行ホストを利用してもよい。キーをチャットやコマンド引数、snapshot、Git、文書へ貼らない。このセッションからユーザー端末へ同じコード/secretが自動で同期されるとは案内しない。
2. **既存値を保持していない場合**：Vercel sensitive設定の存在だけでは現在のWorkへの接続は成立しない。今回の権限内で既存値を非表示利用できる実行場所を確立できていない。キー再発行・失効・Production環境変更・deployは実施しない。
3. **送信前の運用事実**：ITPM/OTPM、直前の消費/予約/reset、全caller停止、未解決送信解消を管理者記録で確認。過去のToday表示を現在残量としない。Production/Previewの停止・設定変更は未承認のため行わない。停止が必要なら対象はこのGroqキーを使う全生成処理、影響は停止中の生成不可であり、実施前の承認が必要。
4. 上記成立後、前回のaccount-snapshot.template.jsonを確認済みの事実で埋め、既存run-first-live-calibration.cjsへ絶対パスを渡す。初回1通信の承認は引継ぎ済みで、同じ承認を取り直すために停止しているわけではない。

前回作成済みの非表示入力とCLIの手順は ../p3-live-auth-implementation/operator-steps.md にある。今回、新しい生成器・認証画面・通信基盤は作らない。

## 実測項目と次工程
HTTP結果・prompt/completion/reasoning/total tokens・推計との差はすべて未取得/算出不可。実台帳とusageの照合も未実施。
入力仮予約5000+出力1000=6000は保証上限ではない。固定wireと通常3000は変更なし。
通常3000の生成へはまだ進めない。初回校正・usage照合後に通常設定の容量とJSON成立を確認し、その後の明示された通信範囲で文章品質を評価する。
DB接続/書込、Production/main/決済変更、push/PR/Preview/deploy、旧版再生成、キー発行/変更/失効は0。
前回683件成功は前回の検証結果であり、今回再実行した数字ではない。
