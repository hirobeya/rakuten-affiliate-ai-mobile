# 初回実校正の接続操作

これは通常生成ではなく、凍結1000wireの1回だけを実行する隔離CLI。
今回の条件付き承認は引継ぎ済み。承認の取り直しではなく、未確認の実行前事実と認証の注入が必要。

## 1. 認証の実行場所

今回Vercel connectorのdecrypt=falseでGROQ_API_KEYの設定metadataだけを照会した。
Production / Previewの双方にsensitive型がある。値は復号・表示・保存していない。
現在のWorkプロセスは、環境変数GROQ_API_KEYが未注入（存在のbooleanのみ確認）。
Vercelの既存deploymentにある秘密値がWorkプロセスへ自動で渡ることはない。
利用可能なconnectorにも、既存deployment内へこのローカルCLIを転送し既存secretを使って実行する機能は確認できなかった。Sandbox作成は既存deploymentのsecret注入の証明にはならず、今回は作成していない。
decrypt/get env/env pullで既存secretを抽出する、新endpointをdeployする、既存本番APIで別wireを送る等の代替は実施しない。

**必要な接続操作:** このcheckoutを実行する信頼できるホストのプロセスへ、管理者が既存のGroqキーを安全に注入する。チャット・コマンド引数・snapshot JSON・文書・ログへ値を書かない。既にキーが環境注入されるホストを使うか、管理者が保管済みの値を非表示入力する。
Vercelにしか保管されておらず既存値を安全に使える実行場所もない場合、この禁止範囲のままでは接続できない。APIキー発行・Production変更・deployを勝手に行わず、その接続方式の判断を依頼する。

## 2. 非秘密snapshot

account-snapshot.template.jsonを別ファイルにコピーし、nullを実際に確認した情報で埋める。テンプレートのままでは送信不可。

- Organization Limitsのsplit適用を確認。適用ならsplitApplicability=applicableとsplitTokens.itpm/otpm/otherInput/otherOutputの実値を記入。適用なしを確認できた場合だけnot-applicable。表示に分割値がないだけでは適用なしとしない。
- otherTokens/otherRequestsは日次の既消費・未解放予約、otherWindowTokens/otherWindowRequestsは直前窓の既消費・未解放予約。organization/project双方に記録。不明を0にしない。
- verificationに確認日時（epoch milliseconds）、確認者、取得根拠、reset説明、未解決request/予約件数を記録。未解決があれば開始不可。
- dayは確認したprovider日次期間を示す。observedAt/validUntil/exclusiveUntil/grant.expiresAtは管理者の確認時点と実際の運用期限を記入。ローカル有効期限はproviderの残量保証ではない。
- production / preview / actions / local-cli / other-playgroundを対象に、稼働callerの停止事実と根拠を記録。別host・別cloneも含める。対象外を含め、根拠なくpaused=trueにしない。
- 専有はsnapshot取得から送信・usageと台帳照合完了まで維持。未知状態なら停止を継続。今回はProduction停止操作を実施していない。
- account.idは管理者が確認したorg/projectの非秘密な識別。project独自制限なしという確認は上限制御へ反映済み。

## 3. 実行

既存キーをプロセスへ注入済みの場合、このcheckoutのルートで、確認済みsnapshotの絶対パスを渡す。

```bash
node scripts/rebuild/run-first-live-calibration.cjs /absolute/path/confirmed-account-snapshot.json
```

管理者が保管済みのキーを持ち、このホストで手入力する場合の例（bash）。値はチャットに送らず、このホストの非表示入力へ直接入力する。新しいキーを発行する指示ではない。

```bash
set +x
IFS= read -r -s -p 'Existing Groq key (hidden): ' GROQ_API_KEY
export GROQ_API_KEY
node scripts/rebuild/run-first-live-calibration.cjs /absolute/path/confirmed-account-snapshot.json
unset GROQ_API_KEY
```

このチャットからユーザー端末のシェルへsecretを注入するUIは提供できていない。現在のWorkへ注入できなければ、管理者の信頼できるホストで同じcheckout・同じCLIを使う必要がある。別ホストでの実行を、Workから実行済みとは報告しない。

## 4. 結果

固定保存先はdocs/rebuild-20261028/p3-first-live-state。コピーや削除で再実行しない。複数ホストで同時実行しない。

- calibration.jsonとhttp/transport.jsonのattempt/hash/usageを照合。
- HTTP status、prompt/completion/total、providerが返した場合だけreasoning_tokensを保存。
- rate limit headerは数値とdurationのallowlistだけ保存。欠落を0にしない。ヘッダーの意味からminute/day残量の全体を推定しない。
- length/JSON未完了でもreportedUsageがあればHTTP台帳へ保存するが、成功扱い・公開はしない。
- timeout/429/usage不明/過剰使用/保存失敗/台帳不整合では停止し、再送しない。
- 正常でもholdで停止。ROOM文章を返さず、審査・書直し・別商品・3000の送信はしない。
- 計画予約6000は保証上限ではない。実測値との差とprovider追加計上の不確実性を残す。

今回の条件不足は、同じtokenizer調査では解消しない。必要なのは確認済みsnapshot、実際の専有、secretを外へ露出しない実行環境である。
