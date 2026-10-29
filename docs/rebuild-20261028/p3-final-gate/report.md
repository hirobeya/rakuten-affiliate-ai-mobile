# P3-B前・容量ゲート成立条件の最終確定

2026-10-28 JST。**容量ゲート未合格。P3-B開始不可。**

## 1. 開始状態と対象

ローカル `/workspace/scratch/1d246d5b49d6/urenavi`、branch `rebuild/urenavi-core-20261028`。
開始HEAD `12d370c98bc200f7c3996ab9cf48e44c5ec34ef8`、未コミット変更なし。
前回P3-A／p3-preflightの証拠を読み、既存実装へ限定追加。mainからの再構築なし。
最終コミットはこの報告を含むローカルgit logで確認する。

## 2. 原因分類と10商品

### 算定指標の違い

前回の「8000超過」は **入力ヒューリスティック＋出力予約3000 > 仮定TPM8000**。モデルcontext131072超過の意味ではない。また単一リクエストtoken上限が公式に8000と確定した意味でもない。

初稿には内部計画／生成本文／審査結果／失敗feedbackはまだ入っていない。初稿超過を内部計画の実サイズのせいにはできない。

完全原文10商品の初稿を、実際のrequest全体のJSON直列化に対して重複のない区分へ分解した。各区分を連結すると元のJSONと厳密一致し、区分の重みと500を合算・切上げすると既存estimateと一致するテストを追加。

共通部分の寄与は固定指示937.85、schema1761.75、framing66.75、generationConditions0.50、余裕500、出力予約3000。itemCodeも計上。全原文が空の診断用baselineは合計6271で、原文増分に使える仮定余裕は約1729。空原文baselineは因果分解だけに使用し、実行入力として承認していない。

### 超過5件

| 商品コード | 商品説明itemCaptionの寄与 | 初稿合計 | 8000超過量 |
|---|---:|---:|---:|
| daiya:10001447 | 3726.90 | 10216 | 2216 |
| daiya:10001030 | 4000.70 | 10502 | 2502 |
| living-mahoroba:10015748 | 2358.00 | 8808 | 808 |
| ritoashop:10000039 | 3599.20 | 10134 | 2134 |
| lebenwood:10004953 | 2500.25 | 9012 | 1012 |

主要な商品間差は説明欄の長さ・文字構成。加えて商品名、catchcopy、固定指示、schema、500の余裕、3000の出力予約が合算される。全10件の商品別分解はproduct-table.mdとcapacity-analysis.jsonへ保存。

他の5件：ipow:10000579=6914、linofle:10000458=7115、yukaiya:10001267=6423、daiya:10001455=7084、brian:10001257=7011。これも推計であり実枠で送れる証明ではない。

34件は原文欠落のまま列挙しpayload未構築。空文字補完なし。

### 重複の調査

初稿の原文はsourceに一度。固定指示とresponse_format schemaは役割が異なる。schemaを各工程へ再送すること、引用が原文と計画・本文の双方に存在することは現契約に実在する。HTTPのuser文字列がJSONの中でエスケープされることも必要な形式で、直ちにモデルpromptの重複tokenを意味しない。

削除しても安全性・意味が維持されると確認できた不要な原文二重送信は見つからなかった。原文、引用、条件、外部契約、出力上限は削減していない。大幅な内部表現変更も行わなかった。

## 3. 使用モデル・API・公開制約

静的コード確認：core/contracts.jsのmodelはopenai/gpt-oss-120b、reasoning_effort medium、messages＋response_format json_schema。既存room-semantic-provider.jsも同モデル系のChat transportを明示している。super-urenavi-v3-groq.jsの既定Responsesを、新版の選択と混同しない。旧providerは文字列として読んだだけで実行時importなし。

予定APIはPOST https://api.groq.com/openai/v1/chat/completions。新版にはまだ実transportはない。

公開資料から：モデルcontext131072、max output65536。ウレナビの上限3000は維持。Free表の例はRPM30／RPD1000／TPM8000／TPD200000だが、実アカウント値は未確認。組織上限とプロジェクトのより狭い上限を同時に守る必要がある。ITPM／OTPMは適用組織で確認し、プロジェクト単独で設定するものではない。

Chatのmax_tokensはdeprecated、推奨はmax_completion_tokens。usageはprompt_tokens／completion_tokens／total_tokens。rate headerのremaining-tokensはTPM、remaining-requestsはRPDであり、残日次tokenを表さない。

公式資料のURLと事実・未確認項目はprovider-facts.json。公式のtokenizerはo200k_harmonyだが、Groqの実chat templateとschemaからのprompt展開・レート予約の計算法は確認できない。visible JSONだけで推論を含む全生成token数を判断しない。

## 4. トークナイザ調査

primary Pythonと既定Pythonでtiktoken／transformers／tokenizers未導入。workspaceおよびprimary Node依存に利用可能な対応rank/tokenizerファイルは見つからなかった。

task scratchへの隔離インストールも試みたが、tiktoken==0.12.0はNo matching distribution foundで取得不能。環境は秘密情報を除いた許可リストのみ、既存依存・lockfileは変更なし。推論通信ではない。

従って互換tokenizer計数は実施不能。tokenizerとの差の欄はnull。これを0差や実計数済みとしない。package導入＋rankデータ＋バージョンhashを確保できる環境なら、保存reqを一切送信せず再計数できるが、それでもproviderのschema展開が未確認なら正確なprompt_tokensとは区別する。

## 5. 将来工程の実構造と上限

| 工程 | 必須の実受渡し | 次の工程へ渡さない情報 |
|---|---|---|
| draft | 原文4欄＋条件、writer指示/schema。内部計画＋product＋本文を1出力 | まだ候補なし |
| review | 原文全文＋条件＋candidate全体、review指示/schema | 過去history |
| rewrite | 原文全文＋条件＋feedback.previous候補全体＋failures＋repair指示 | 審査JSONそのもの、history全体 |
| rereview | 原文全文＋条件＋書き直しcandidate全体、reviewと同じ検査 | 初稿候補／初回審査結果 |

失敗feedbackは最大64件、rule56／detail200 UTF-16単位に制限される。idの出所はschema-valid内部ID（最大12）または文番号。invalid_structureはid/detailなし。診断上限には保守的にid20を確保した。

### 今回証明できたもの

ローカルschema validatorを通るcompact JSONについて、stringはUTF-16単位あたり最大6 UTF-8 bytes、有限JS整数は最大25 bytes、配列maxItems、object固定keysを再帰計算。

- writer候補のcompact JSON：231505 bytes以下。
- review JSON：197640 bytes以下。
- failures JSON：108033 bytes以下。
- 10商品のreview／rereview HTTP直列化上限：473125〜482129 bytes。
- rewrite HTTP直列化上限：689023〜698027 bytes。

JSON文字列をさらに外側JSONへ埋める際のescaping増分を最大2倍として含める。原文とgenerationConditionsは与えられた実値を使う。これらは安全側の**保存・直列化bytes上限**であり、3000出力へ収まる同時実現可能な候補ではない。token上限に変換せず、従来過大envelopeを別単位で予約へ再導入していない。

schema不正の異常に巨大なwriter応答は、従来rewriteへ渡せてしまい将来上限の根拠を失うため、上記candidate保存上限を超えた時点で全体停止する限定修正を追加。本文や原文を切り詰めて救済しない。

### 今回証明できないもの

実生成候補がないため、10商品のreview／rewriteの実token入力は不明。P3-A保存モック3件は同じ候補2322 bytes、審査3969 bytesで、review／rereview推計7215、空feedbackのrewrite推計7236。これは実ファイルのサイズ測定であって、実モデル生成・usage測定ではない。参考モックを10商品の将来実測と置換していない。

出力3000から次工程入力3000とは導けない。tokenのdecode長、JSON escape、引用の複製、付加指示、provider template、生成中の推論tokenがある。schema最大bytesは有限でも、実用的なtoken上限は未証明。

## 6. 限定修正と解消項目

- capacity-analysis.js：重複しない加算分解とschema bytes上限。推計・bytes・tokenを分離。
- admission.js：ITPM／OTPMとproject RPM／TPM／日次の独立判定。宣言済みなのに値が欠落する場合は拒否。送信eventに入力／出力予約を別保存し整合検査。
- local-engine.js：input usageがinput予約を超えた場合も全体停止。異常に大きい候補はrewriteへ渡さず停止。rate台帳検査を完成cache返却前へ移動し、破損時にcacheからも公開しない。
- chat-wire.js：HTTPを一切行わないwire構築・応答decoder。max_completion_tokens=3000へ変換し、元req／schema／原文は不変。429、HTTP異常、model違い、usage不整合、finish_reason、拒否、invalid JSONを拒否。旧providerの実行時importなし。
- final-gate-audit.cjsと新テスト／本証拠群。

wire構築のfield名変更でヒューリスティックが2〜3増えることも記録。これは容量削減ではない。旧contractsのmax_tokensは過去再現性のため変更せず、新wireと区別。wire helperをengineの実transportとして接続していない。liveは引き続き拒否する。

モデルtoken計上の校正、実transportの許可先固定・timeout・不明応答の扱い、組織全体との同期は、この純粋wire helperだけで完了としない。

## 7. 検証・保護

新版既存107＋今回追加35＝142成功、失敗0、skip0。
既存回帰454成功、失敗0、skip0。
合計596成功。

新テストはpartition厳密一致、control／surrogate escaping、schema欠落max拒否、巨大整数、将来bytes上限、ITPM／OTPM／project各境界、declared-but-unknown拒否、input/output台帳改変、input usage超過、異常巨大応答、完成cache時台帳破損、wire4工程と応答異常を対象とした。

再現：

```sh
./scripts/rebuild/offline.sh --test --test-isolation=none tests/rebuild/core.test.js tests/rebuild/admission.test.js tests/rebuild/capacity-analysis.test.js
./scripts/rebuild/offline.sh scripts/rebuild/final-gate-audit.cjs
./scripts/rebuild/regression.sh
```

実Groq推論0、DB接続／書込0、旧版再生成0、秘密情報読出なし。新版はPATH/HOME/LANGのみ。public docsとpackage取得試行以外の外部サービス利用なし。ネットワークguard下で検証し、旧provider／DB／billingの実行時importなし。OS firewall証明はしていない。

前回証拠はpreservation.jsonで開始HEADと全ファイルbytes比較。本番コード、main、Production、認証、決済、DB/RLS、既存ユーザー情報は変更なし。push／PR／Preview／deployなし。

## 8. 最終ゲートと本当に残る条件

### オフラインで解消したこと

- 8000超過5件の内訳と原因の特定。
- 工程間データ構造・実際の複製箇所・JSON形式の区別。
- schemaからの有限bytes上限と異常応答による上限逸脱の停止。
- 組織split token／project制限の計算と異常系テスト。
- Chat wireの構築と応答検査。
- 台帳破損時の完成cache公開拒否。

### P3-B開始前の技術的必須条件

1. 互換tokenizer／rankの固定、およびGroqのtemplate・schema計上を含む送信前入力の検証可能な安全上限。ヒューリスティックのみのlive許可は禁止。
2. 各工程の実wire payload上限と総予約を対応付けること。将来入力は上限保証するか、明示的なstage予算超過で未完成停止する方式を採用し、完遂保証と混同しない。現在の5000入力予算だけでは全工程の成立見込みを示せない。
3. 組織・project別RPM/RPD/TPM/TPD、split制限有無、残量、reset、他用途予約を、秘密値なしで確認。provider-facts.jsonに確認手順を固定。
4. 組織全体の固定台帳と参加caller／停止窓を確定。今回の単一directory lockだけでは別hostや別台帳からの消費を保護できない。
5. HTTP許可先、redirect禁止、timeout後の送信不明、応答保存とusage照合を担保する実transportをオフライン検証し、明示承認と接続すること。純粋wire helperは完了したが実transportは未実装。
6. 旧新版一致20商品、条件・旧出力・原文の凍結、旧版再生成も含む最大80通信内の実験予算、別途実通信承認。

### 実測でしか確定しない項目

3000出力で計画と文章を実際に完成できる割合、生成品質、審査誤合格、実usage差、修復成功率、無料枠の継続運用成立。これらをオフライン合格扱いしない。

実usageによる校正を「最初の実測の前に実usage実績が必要」と循環条件にしない。最初の実測は、事前に根拠を持つ入力安全上限・実アカウント枠・送信停止制御・明示承認が成立したうえで実施し、その結果で以後の許容量を校正する。現時点では事前条件1〜6が揃っていない。

判定：**未合格、P3-B保留。今回の成果を品質改善・無料枠成立・完成としない。**
