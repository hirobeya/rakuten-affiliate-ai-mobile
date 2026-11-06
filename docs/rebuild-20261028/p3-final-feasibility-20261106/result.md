# 最終実行可能性判定（追加推論なし）

## 判定

C：確認済みの無料8,000TPM、現在の固定wire、および「入力上限を根拠なく保証しない／既存の容量保証を弱めない」という条件を同時に維持した実測は、現在の公開手段では安全審査を通せない。無料で生成そのものが不可能という主張ではなく、今回の条件で事前の上限保証を成立させられないという判定。

前回Workが追加したprovider-input-upper-bound証明はGroq公式の利用必須条件ではない。公開API Referenceにはこの完全なwireの内部prompt計数・Schema展開・rate admission値を生成前に返すエンドポイントを確認できない。これは公開仕様を調べた範囲の結論であり、Groqサポートが個別情報を提供できないという断定ではない。「その証明を取得すれば実行可」とだけ案内することは、取得経路が確認できていない以上、実行可能な解決策ではなかった。

## AとB、推定値を使う代替

A=入力5,000＋出力3,000＝8,000、名目余裕0。
B=入力5,000＋出力2,500＝7,500、名目余裕500。
どちらも入力5,000以下の根拠は未確定。既存local計数2527/HTTP JSON2579、以前の実測prompt2729、固定wire byte9791は事前観測値・過去実測・サイズ制限として利用できるが、provider内部の入力上限保証ではない。

固定hash/byte制限、変更なしのsource、排他窓、未処理照合、現在容量、保守的予約、永久claim、429停止、再試行禁止を組み合わせた「推定による限定probe」は技術的に実装可能。しかし入力上限超過の残余リスクはゼロにならず、現行の未検証上限拒否からリスク条件を変更する。今回の安全保証維持の指示下では採用・実装しない。Bへの変更も自動採用しない。

JSONは既にcompact serialization。Schemaの共通部分を$defs/$refへ統合する、内部planを縮める、promptの重複を削る案はwireと比較条件が変わり、provider側展開後の計数保証にもならない。原文・引用・scope・関係を削れば品質の別変数にもなるため今回行わない。

## 実現可能性が高い代替：同一wire＋大きい容量枠＋モデル上限からの保守的予約

公式掲載値：120B context131,072、Developer250,000TPM。公開APIはinput＋generated tokensをモデルcontext内とする。入力を5,000と推測せず、モデルcontext全体131,072を入力枠として保守的に取り、出力cap3,000も別途確保する例では134,072。この足し方はcontextから出力を差し引く必要がなく、実使用量に対して意図的に過大な予約になる。Developer掲載TPMとの差は115,928。旧6,000を残して日次140,072、別履歴8,000も残す例では148,072。公開掲載のDeveloper枠は当該組織の実際の許可値や現在残量ではない。

134,072はquota拘束の過大包絡であり、モデルcontext自体を134,072へ増やす意味ではない。現行admission.singleは予約合計をcontextと比較するため、この値をそのまま渡して通過できるとは報告しない。承認後のprofile切替ではquota拘束と実モデルcontextの検査を分け、実モデルの131,072制約を維持する必要がある。この予約はモデルが扱うtoken量の保守的包絡であり、provider内部の非公開rate前処理カウンターそのものの正確な値ではない。providerの拒否や429が起こらないと保証しない。現在の文脈上限・実アカウント/Projectのcombined/split制限と未使用枠、その他の使用と残予約、日次/要求/コンテキスト制限、排他を検査し、想定外の拒否は既存通り停止・全予約保持・消費未確定扱いとする。API仕様と矛盾する挙動までクライアントだけで保証はできない。

必要な具体的操作：
1. 管理者本人がGroq Console BillingでDeveloperへの変更を検討・承認して実施する。今回、決済操作・アップグレード・環境変更は行わない。
2. 管理者とWorkがOrganization/Projectの実Limitsを確認する。少なくとも134,072＋その他分間使用を収容するTPM/残量、splitがあれば入力131,072・出力3,000を収容する枠、旧holdを含む日次枠が必要。250Kへ自動増加したと仮定しない。
3. Workはユーザー承認後、既存比較経路の予約profileをモデルcontext由来へ切り替える。現在の8,000固定ゲートへ嘘のprovider証明や数値を渡す方法は使わない。wire/product/model/medium/Schema/promptは維持する。モデルcontextの掲載値を実行時に再確認する。
4. 管理者が全送信元停止、未処理通信の照合を確定し、Workが既知terminal台帳・組織の完全な送信履歴・provider reset情報と現在の送信元状態を照合する。遅延Usage画面を現在残量と偽らず、履歴の穴や未処理があれば実行しない。完全な排他窓と既知使用量から容量を導く場合も、その計算根拠を記録する。
5. ユーザーが新予約方式と同一wireの最大1通信を明示承認後、比較runtimeを有効化する。

同じ無料枠を維持する場合の別経路は、管理者がGroqサポートからこのwireの送信前計数/上限またはrate admission仕様を取得できた場合に限り再判定する。サポート回答が得られること自体を保証しない。こちらから送信していない。無料維持を必須にしたまま検証不能な完全保証を要求し続ける解決策は提示しない。

## JSON失敗の切分けと今回の限定修正

確定：HTTP400/json_validate_failed、prompt2729/completion1000、strict=true。
未確定：token上限による途中切れ、特定Schema要素との不適合、providerのStrict境界挙動。failed_generationとfinish_reasonが旧証拠にないため、一因を断定しない。全required/closed-objectなどの静的検証は適合。公式はStrictのSchema保証を説明する一方400の再現報告も求めており、今回の事実を無視しない。

新観測は既存の安全なエラー記録に以下を追加：既知finish_reason（未知文字列は保存しない）、lengthフラグ、retry-after数値（再試行には使わない）、failed_generationがparse可能な場合のSchema適合と違反path/rule、parse失敗位置（提供できる場合）。違反pathはSchemaが定義する名前と配列indexのみとし、未知property名・値・reasoning・秘密値は診断へ混入させない。未完成JSON本文の保存禁止と公開/コピー禁止を維持。providerがusage/finish_reason/failed_generationを返さなければnull/未提供であり0や原因確定に変換しない。

旧永久claim、校正/HTTP台帳、精算証跡、6,000拘束、旧消費3,729の取り扱い、比較wireHash、liveゲート、生成器、prompt、Schema、出力cap、planは変更なし。追加Groq推論0。今回の実装変更は観測診断のみで、判定・代替予約はオフライン計算として保存した。

公式照合元（2026-11-06取得）：
https://console.groq.com/docs/api-reference
https://console.groq.com/docs/models
https://console.groq.com/docs/rate-limits
https://console.groq.com/docs/structured-outputs
