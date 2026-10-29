# ウレナビ再構築｜初回実測・開始条件の最終解消結果

2026年10月29日（日本時間）

## 1．開始HEAD・最終HEAD

Repository：hirobeya/rakuten-affiliate-ai-mobile
Branch：rebuild/urenavi-core-20261028
実環境で取得した開始HEAD：adb2f0fa6572770aa4a169b52efa3949b532fd73
開始時未コミット変更なし。別ブランチからの再構築なし。
最終HEADは本報告を含むローカルコミットの完全SHAをユーザーへの報告に記載する。
前回までのdocs/rebuild-20261028の全追跡証拠を開始HEADとバイト比較し一致。preservation.json参照。既存証拠の上書きなし。

## 2．今回変更したファイル

- lib/urenavi-core/calibration-runner.js：送信台帳と容量台帳の照合、snapshot hash保存、モック認証の受渡し
- lib/urenavi-core/isolated-transport.js：固定モックBearerの受渡し境界だけ追加。実認証やsecret取得は追加しない
- tests/rebuild/calibration-runner.test.js：追加14ケース
- scripts/rebuild/final-start-gate.cjs：既存凍結wire照合・A/B/C・未確認値を機械記録。再トークン計数なし
- docs/rebuild-20261028/p3-live-boundary-final/：新規報告・Console確認票・公式窓口質問案・gate・一次資料確認・保護照合・テスト証拠

既存admission/永続台帳/lock/offline guard/transportを再利用。新規大規模基盤なし。

## 3．Groq公式情報から確認できた入力計上方法

| 対象 | 確認できたこと | 確認できなかったこと |
|---|---|---|
| role framing | APIのmessages/role形式、公開OpenAI Harmony系tokenizer | Groqでのrole特殊token数・区切り・templateの版 |
| assistant prefix | 公開モデル側のformatとGroq Chat APIの役割 | Groqが生成開始時に付加するprefixと計上数 |
| strict schema | gpt-oss-120bがstrict対応、constrained decodingを使用 | schemaがpromptへ挿入/複製されるか、展開token上限、別rate負荷 |
| tools/追加指示 | 凍結client wireにtools/search/compound指定なし、system＋userの2件 | provider内部追加system/developer指示の有無と長さ |
| 送信前計数 | 互換tokenizerの既存計数、APIのusage形式 | このwireを推論なしでprovider計数する公式endpoint/保証上限は未発見 |
| RPM/TPM等 | 組織/project上限、optional org ITPM/OTPM、429、header単位 | 受付時にmax outputや入力を何token予約し、いつ精算するかの完全式 |
| reasoning | 推論がtoken出力の一部、medium対応、max_completion_tokensは生成上限 | 今回の推論割合・完成JSONの実サイズ |

公式API reference/structured outputs/reasoning/rate limits/projects、公式SDK、OpenAI公開tokenizerを対象に限定確認した。公式SDK/公開tokenizerはGroq server実装の証明ではない。SDKに既定retryがあるため、既存のretryなし直接transportを維持した。

Groq API referenceのResponses max_output_tokensと今回のChat max_completion_tokensは別パラメータとして扱った。今回Chatの生成上限3000を維持し、推論を別の無料出力枠として加算しない。

公式に見つからない項目を「存在しない」と断定しない。tokenizer比較・文字換算・同じ容量監査の反復は今回実施していない。

## 4．未確認の内部処理と安全な代替手段

**内部実装の完全再現そのものは必須ではない。** 次のいずれかが今回wire/model/API/schemaへ適用され、根拠を検証できれば代替できる。

1. providerの非推論計数/preflightが返す保証上限。
2. 公式に保証されたframing/schema等込みの保守的入力上限。
3. 公式に保証された、より大きい総消費上限を丸ごと確保できる実アカウント枠と計上根拠。

今回はいずれの根拠も確保できていない。公開model context131072だけでは、受付時rate予約式も出力予約との関係も証明できず、仮定TPM8000にも収まらない。UTF-8 byteによる粗い上限、未検証の余裕2473は今回wireのprovider入力5000以下を保証しない。

他callerの停止とprovider側429 enforcementは、競合防止・被害限定には役立つが、送信前入力上限を検証できたことにはならない。429時の無消費も公式確認できていない。今回の安全条件で「1回試して429なら止める」だけを容量合格の代替には採用しない。

Batchや別model/上限削減/他organizationへの切替は凍結条件または今回範囲を変えるため不採用。プラン変更等の有料操作もしていない。

公開情報だけで必要な上限を保証できなかったため、対象wireに絞った公式窓口確認案をprovider-inquiry.mdへ作成。Developer CommunityはGroq Docsから案内される。Contact公式ページも確認したが、取得内容だけでは技術問い合わせの送信手順は未確定。ユーザーが既存Consoleのサポート導線を使えるなら優先する。問い合わせ投稿・メール送信は一切していない。

## 5．初回wire容量ゲート

商品：yukaiya:10001267（洗濯ネット6枚セット）
原文hash：1b142873671ba6906329a4217cc8c5a2811feba46c3fa27fdefcbd8ac2854c91
wire hash：ab9f962665d02755d3e2fc683969472466e2da2964e7ce0cb7a13aa3d872d053

現実装から再構築したwireを前回の凍結wireと照合し完全一致。原文/schema/出力上限/生成条件を変更していない。
前回計数2527（可視component）/2579（HTTP JSON普通テキスト）は引き継ぎ値。provider prompt_tokensに読み替えない。
入力予約5000＋出力予約3000＝8000、1requestは仮予約上限のまま。provider込みの保証入力上限はnull。
**容量ゲート未合格。実アカウント残量が判明しても、入力計上根拠がなければ自動合格しない。**

## 6．実アカウント確認項目と具体手順

認証済みConsoleは今回参照していない。実organization/projectの値やcaller停止を取得済みとは報告しない。
console-confirmation.mdに「操作画面・取得値・確認日時・判断条件」の表を保存した。確認日時と実値は全未確認。

- Organization Limitsの対象model行：RPM/TPM/RPD/TPD/モデル許可。公開表は代入しない。
- 同TPM hover：ITPM/OTPM有無と値。
- Settings→Projects→対象projectのモデル別制限：独自枠か継承か。組織枠も同時適用。
- project選択→DashboardのUsage/Metrics/Logs：消費request/token、期間、更新遅延。各projectと他callerの管理記録を照合して組織全体へ集計。
- reset表示と既存の非秘密記録：minute/day境界とtimezone。remaining-tokensはTPM、remaining-requestsはRPDであり、残TPDの代用不可。
- 全callerの制御/管理記録：実消費、未完了予約、未解決送信、停止事実、in-flight照合。
- 実行operatorの記録：snapshot確認日時、有効期限、専有期間、管理host/canonical journal。

グラフのrate5mや月次spendを残minute/day tokenへ安易に変換しない。残量やresetが確定できなければunknownとして停止。API Keys・環境変数の中身は開かない。

## 7．初回専有方式の成立条件

全caller一覧→承認された担当者による実停止→in-flight/不明usage照合→providerのminute回復確認→日次消費を残して1回枠確保、の順で成立し得る。project分離だけでは組織枠を専有できない。

専有期間は開始/終了と根拠を記録し、snapshot/許可の有効期限をその内側に設定する。実停止未確認を停止済みとして扱わない。今回の本番変更禁止に従い、caller停止は実施していない。

1回成功後もhold。429/timeoutでもhold。両台帳とprovider記録を担当者が照合し、未解決を残したまま他用途予約を解放しない。別host/別directoryを使ってlockを迂回しない。

## 8．live接続準備の検証結果

固定の非秘密モックBearerだけをtransportへ渡す経路を追加。実キーや任意Bearerは受け付けず、offline guard/1回専用許可は維持。

モック確認済み：
- 固定URLへのAuthorization header付与、POST、redirect:error
- header/Bearerがrunner結果・両journalへ混入しない
- 容量/レート/日次/組織/project/ITPM/OTPMの事前判定
- 送信前durable記録・attempt重複拒否・snapshot期限・排他lock
- timeout/429/usage不明/保存失敗の停止、retry0
- 未完成非公開、成功後も1回で停止、共有予約hold
- 両台帳のattemptId、request hash、stage、status、usage、reportedUsage、response content hash、容量予約の照合
- 不一致10種類を拒否。照合失敗なら未解決・holdを維持し公開しない

前回は両台帳を保存していたが、runner完了前に両者を明示照合していなかった。今回この境界を修正した。snapshot本文ではなくhashをrunner台帳へ束縛した。

実接続が必要：実認証の受理、正しいorg/projectに紐づくこと、provider usage/header/finish_reasonの実値。モック成功はそれらの証明ではない。
現在のrunner/transportはguard必須、offline-test-only許可のまま。live許可や秘密値の受取りを有効化していない。将来の実認証接続と通信禁止構造の変更は、別の明示承認の対象。

## 9．テスト結果

新版：前回197＋追加14＝211件成功、失敗0、skip0。
既存回帰：454件成功、失敗0、skip0。
合計665件成功、失敗0、skip0。

実行：
./scripts/rebuild/offline.sh --test --test-isolation=none tests/rebuild/*.test.js
./scripts/rebuild/regression.sh
./scripts/rebuild/offline.sh scripts/rebuild/final-start-gate.cjs

## 10．実通信・DB・秘密情報・本番への影響

実Groq推論0、DB接続/書込0、秘密情報読出0、実認証テスト0、旧版実再生成0。
公開一次資料の閲覧のみ。サポート送信なし。main/Production/決済/本番コード/外部契約/拒否条件/原文/出力3000/medium変更なし。
push/PR/Preview/deployなし。既存最大4通信・書直し最大1回・429後retry0は維持。初回runnerは1通信で停止。

## 11．初回1通信の開始可否とA/B/C

**未合格・開始不可。今回も実通信は禁止したまま。**

| 分類 | 内容 | 結果 |
|---|---|---|
| A：今回のオフライン作業 | モック認証境界、台帳照合、凍結条件、停止/保護の実装と検証 | 完了 |
| Aの調査で判明した開始前の外部依存 | 内部再現の代わりになるprovider保証上限/非推論計数の根拠 | 公開資料では未解消。公式回答等が必要 |
| B：ユーザーのConsole/運用確認 | 実枠・残量・reset・共有消費・未解決送信・専有事実 | 未確認。具体確認票を作成 |
| C：承認後の1通信で校正 | prompt_tokens、reasoning内訳、実completion、header、finish_reason、実認証受理 | 未実施。事前の成功実績は要求しない |

Cの厳密値や内部計上式の完全再現を事前の必須条件にはしない。ただし、Cの値が事前の保守的予約に収まる根拠は必要。その上限根拠まで「Cだから後で分かる」として省略しない。

## 12．開始不可の理由と残作業

1. provider込み入力上限/受付時計上の根拠が未確定。公式窓口質問案から保証上限または非推論preflightの根拠を得る。完全内部式を要求し続ける必要はない。
2. Console確認票の実値と確認日時を記入し、全caller停止/未解決送信照合/専有期間を実確認する。
3. 上記を凍結wireの1回予算に適用し、別途、実認証接続と1通信だけの明示承認を受ける。

同じトークナイザ計数やモックの追加反復では1/2は解決しない。外部根拠の取得を次の有効作業として確定した。20商品比較や文章品質は今回の開始条件へ混ぜていない。
ウレナビ完成・文章品質改善・無料枠運用成立は宣言しない。

## 一次資料

- https://console.groq.com/docs/api-reference
- https://console.groq.com/docs/structured-outputs
- https://console.groq.com/docs/reasoning
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/projects
- https://github.com/groq/groq-python
- https://github.com/openai/gpt-oss/blob/main/gpt_oss/tokenizer.py
- https://groq.com/contact
