# P3-B開始前・外部確認事項の解消と最終準備
2026年10月29日（日本時間）

## 1．HEAD
開始HEAD：e8588abe9805e0fca61eda613198cccc573c46a6。開始時クリーン。
終了HEADは本報告を含むローカルコミットの完全SHAをユーザーへ記載。新規文書のみをコミット。本体変更・テスト追加なし。

## 2．今回解消した条件
公式Prompt Caching資料により、対象モデルの対応、ヒット非保証、cached tokensの処理後控除を確認。
結論：初回容量予約ではcacheによる減額を見込まない。cache-awareな事前保証がない以上、過去のhitも次の送信許可に流用しない。
これはキャッシュ減額を前提にしないという判断の確定であり、入力5000以内の証明ではない。
strict schemaの対応やconstrained decoding、組織/project双方の制限は公式資料と整合。schema展開込みの保証上限や受付時の完全計上式は今回も取得できなかった。完全式ではなく、適用範囲が確かな保守上限／非推論preflightでも代替可能。

## 3．サポート確認
日英の完成文をinquiry-ja.txt／inquiry-en.txtへ保存。質問は5点：
1. strict schema込みの非推論計数／保証上限。
2. framing/prefix/追加指示/schema展開の公式確認方法。
3. 初回1回の消費を制御できるprovider保証の代替方法。
4. 入出力上限/推論/usage/失敗時のrate予約と精算。
5. cacheの処理後控除と、事前減額を許す保証の有無。
未送信。明示承認なしに投稿・メールを送らない。Groq Docsが案内するDeveloper Community等の公式窓口で、対象model/API/schemaに対する回答を得る。未送信なので「回答待ちの問い合わせ受付済み」とは表現しない。

## 4．実アカウント確認
専用Groq管理connectorは見つからなかった。ローカルBrowser操作toolも見つからず、browserスキルに従ってcloud browserを使用。
https://console.groq.comを開いた結果、公開のBuild FastページとLog Inリンクを確認。認証済みの管理情報は表示されなかった。ログイン操作・キー画面アクセス・秘密値読出なし。
したがって組織RPM/TPM/RPD/TPD、ITPM/OTPM、project枠、現在の消費/reset/共有利用/未解決予約は全て未確認。値を0で補完しない。

## 5．ユーザーの次の操作
既存の自身のGroq Consoleで以下を確認し、数値と確認日時/timezoneを共有する。APIキー/環境変数/認証URLは共有しない。
- Organization Limits：対象modelのRPM/TPM/RPD/TPDとモデル許可。
- TPMへhover：ITPM/OTPMの有無と値。
- Settings→Projects→対象project：独自モデル制限または継承。
- project選択→Dashboard→Usage/Metrics/Logs：当日request/token、期間、更新遅延、最終request。
- 他project/CLI/Actions/Vercel/playground等の管理記録：共有消費、未完了予約、未解決送信。
- Limits/reset表示や非秘密の既存記録：reset日時/timezone。残TPDが画面で分からなければ不明とし、管理者集計/公式窓口で照合。
各項目の確認日時、確認者、有効期限を記録する。前回のconsole-confirmation.mdをそのまま利用できるため、新たな同等確認票は作っていない。
別の作業として、日英問い合わせ文を確認し、送信する場合に明示承認するか自身で公式窓口へ送信する。
共有枠の専有は、全caller把握・停止事実・in-flight解消・providerのminute回復確認が必要。今回は停止操作なし。専有済みとは扱わない。

## 6．開始判定
未合格。初回実Groq通信は開始しない。
商品yukaiya:10001267、wire hash ab9f962665d02755d3e2fc683969472466e2da2964e7ce0cb7a13aa3d872d053を維持。
原文/schema/medium/出力3000/request1/台帳整合/重複禁止/retry0/不明停止/非公開を変更していない。

## 7．外部確認と実装の区別
外部確認待ち（問い合わせ自体は未送信）：provider保証入力上限または代替制御の根拠、実アカウント枠/残量、共有消費と専有事実。
現時点で新規安全装置や追加モックが必要という根拠はない。コードを増やしても外部情報は取得できない。
将来は外部回答が既存予約方式と整合するかを判断し、別途実通信承認の範囲で実認証を接続する必要がある。現runnerはoffline-onlyのままなので、Console値を記入するだけでは実通信できない。この接続作業は今回実施していない。
実測でしか確定しないprompt_tokens/実usage/cache hit/finish_reasonは、事前の成功実績として要求しない。事前に必要なのは、保証上限と既知残量で囲った実験条件。

## 8．影響と検証
コード変更なし、追加テストなし、同じ665件の再実行なし。前回211＋454＝665成功は前回結果として維持し、今回実行済みとは表現しない。
既存証拠全ファイルを開始HEADとバイト比較、凍結source/wire hashを照合。結果はpreservation.json。
実Groq推論0、DB接続0、秘密値読出0、問い合わせ送信0、旧版再生成0。
main/Production/決済/DB/RLS/認証設定/本番依存/外部契約変更なし。push/PR/Preview/deployなし。
ウレナビ完成・文章品質改善・無料枠運用成立は宣言しない。

出典（2026-10-29）：
https://console.groq.com/docs/prompt-caching （How It Works: hit非保証、処理後rate控除）
https://console.groq.com/docs/rate-limits
https://console.groq.com/docs/projects
https://console.groq.com/docs/structured-outputs
