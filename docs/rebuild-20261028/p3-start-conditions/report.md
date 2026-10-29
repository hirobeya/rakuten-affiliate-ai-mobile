# ウレナビ再構築｜P3-B開始条件・最終オフライン準備

実施日：2026年10月29日（日本時間）。10月28日付指示を継承。

## 判定

P3-B未開始。容量ゲート未合格。実Groq推論0、DB接続・書込0、旧版再生成0。
新版の保護、HTTP送信アルゴリズムの隔離実装、異常系・engine接続テスト、原文・比較候補凍結まで実施。
品質改善、無料枠での継続運用成立、完成は宣言しない。

## 1. 開始とコミット

Repository: hirobeya/rakuten-affiliate-ai-mobile
Branch: rebuild/urenavi-core-20261028
開始HEAD: 07c932d0b32225f4a67e391d16cc39d4d19e7415
開始時未コミット変更なし。最終コミットは本報告を含むgit HEAD（コミットの自己参照を避け、ユーザーへの報告に完全SHAを記載）。
既存docs/rebuild-20261028の全追跡証拠を開始HEADとバイト比較し一致。preservation.json参照。

## 2. 変更ファイル

追加のみ。本番コード・既存新版中核・外部契約・拒否条件の変更なし。

- lib/urenavi-core/isolated-transport.js
- tests/rebuild/isolated-transport.test.js
- scripts/rebuild/start-conditions-audit.cjs
- docs/rebuild-20261028/p3-start-conditions/配下の本報告・容量・実wire・比較候補・過去推論usage・環境・保護照合・テスト証拠

## 3. 計数結果と限界

互換トークナイザ計数は実施不能。tiktoken/transformers/tokenizers未導入、対応rank/tokenizerキャッシュなし。
既定/usr/bin/python3にはpipなし。primary runtime Pythonでtiktoken==0.12.0取得を試み、隔離設定＋明示PyPIでもavailable versions none / No matching distribution found。
この環境から配布物を取得できないことは確認した。ネットワーク制約と配布フィルタのどちらが最終原因かはpip出力だけでは断定できない。パッケージ自体が存在しないとは判断しない。

10商品は原文4項目を一切変更せず、max_completion_tokens=3000の実wireを凍結した。
審査・書直し・再審査も、保存モック3件から実wire計19件を保存。実商品での将来候補ではなく構造確認用モックと明記した。
メッセージ、schema、追加指示、条件、内部計画、候補本文、failuresを含む。
JSONエスケープ済みHTTP bytesとモデルprompt tokenは異なる。providerのchat template/schema展開・予約計上は未再現。
inputTokensはnull。既存換算値は診断専用で、正式安全上限にもlive許可にも使わない。

代替方式：認証済みtokenizer＋rankを別の取得可能な環境で固定して持ち込み、保存wireをオフライン計数する。全メッセージ内容とschemaを分けて測り、Harmony/テンプレート・schema展開の未確定分を別記する。tokenizerだけでprovider入力上限の証明が完了したとはしない。根拠がない500等の余裕を正式安全値にしない。

## 4. 完全原文10商品の容量

全件、出力予約3000、仮定TPM8000。下表の入力/合計は未校正ヒューリスティック。実tokenではない。

| 商品コード | 入力の診断値 | 出力込み診断値 | 8000超過分 |
|---|---:|---:|---:|
| daiya:10001447 |7219|10219|2219|
| daiya:10001030 |7504|10504|2504|
| ipow:10000579 |3917|6917|0|
| linofle:10000458 |4118|7118|0|
| yukaiya:10001267 |3425|6425|0|
| living-mahoroba:10015748 |5811|8811|811|
| daiya:10001455 |4087|7087|0|
| ritoashop:10000039 |7136|10136|2136|
| brian:10001257 |4013|7013|0|
| lebenwood:10004953 |6014|9014|1014|

前回との差2〜3はmax_tokens→max_completion_tokensを含むwireのキー長差。商品原文や上限の変更ではない。
重点5件の診断上の原因は、長いitemCaptionと固定指示/schema、出力予約の合算。初稿にはまだ候補・内部計画がないため、それを超過原因としない。
他5件も送信可能の証明ではない。

各商品の条件付き経路予算は2工程16000、最大4工程32000（各工程入力5000＋出力3000）と記録。この値は、各送信前に検証可能な入力上限を求め、5000を超えたら未完成停止する場合の予算であり、完遂保証・予測値ではない。現行engineのliveは引き続き拒否される。
将来入力は実生成候補がないため不明。schemaから求まる有限bytes上限はcapacity.jsonへ継承したが、token安全上限に変換していない。
全件の不確実性・不足原因・実測項目をcapacity.jsonへ保存。34商品の欠落catchcopyは補完していない。

## 5. 無料枠で成立する条件／成立を示せない条件

モデル能力、context、rate、経路通信を分離。
モデルcontext131072は文脈容量でありTPM8000ではない。contextに入ってもminute/day枠を超えれば運用できない。
公開Free例はRPM30/RPD1000/TPM8000/TPD200000。組織の実値・残量ではない。

条件付きで成立し得る経路：初稿→審査で合格なら2通信。初稿機械不合格→書直し→再審査なら3通信。初稿→審査不合格→書直し→再審査なら最大4通信。完成結果再利用は0通信。4回必須ではない。
各リクエストが実枠内、各送信直前の組織/projectのminute/day予算内、他用途予約済み、全callersが同じ台帳を使うことが必要。

成立を示せない経路：未校正換算だけで送る、単一リクエストが実枠を超える、残量不明、他callersが未管理、3000で候補を完成できると仮定して続行する経路。minute枠の回復待ちで、単一リクエスト自体の超過や日次不足は解決しない。

17商品：通常2工程なら最大34通信/条件付き272000予約、4工程上限68通信/544000予約。公開TPD200000ではこの予約上限を同一日に全件保証できない。全量予約を維持する保守運用なら他用途なしでも通常2日以上/最大3日以上が必要。実際の日数はusageと予約方式次第。20商品なら最大80通信/640000予約、同様の保証には4日以上。80を使い切る計画ではない。

秘密値なしの確認手順：利用者の既存Consoleから正しいorganization/projectを選択しLimitsの対象モデルRPM/RPD/TPM/TPD、TPM hoverのITPM/OTPM有無、projectの独立上限を確認する。Usageで同期間の全用途消費を確認し、確認日時とreset/timezoneを記録。API Keysや環境変数は開かない。残日次tokenが画面から確定できなければunknownとして停止し、管理者の利用集計で照合する。
公開headerのremaining-requestsはRPD、remaining-tokensはTPMで、残TPDを示さない。過去headerは現残量として使わない。
rateの実際のローリング/補充方式・resetと日次境界は実アカウントで確認し、ローカル窓モデルが完全一致すると仮定しない。

## 6. 出力3000の構造成立条件

reasoning_effort=medium、max_completion_tokens=3000は維持。
Groq Chat仕様は生成token上限を定義し、Reasoning資料は推論もtoken出力の一部と説明している。推論を非表示にしても、最終回答へ3000全量が使えるとは扱わない。
保存済み旧usage59件にreasoning_tokensが存在（370〜1926）。旧版実績であり新版の予測ではない。
必要条件は、推論token＋最終JSON全体＋生成上の終端等が3000以内で完了し、finish_reason=stop、JSON/計画/引用/品質審査を通過すること。
内部planも最終JSONの一部なので、本文以外に出力予算を使う。reviewも全planID・各文・品質項目を出す必要がある。schema最大形は3000以内を保証しない。
モックの存在はJSON形が構成可能という証拠であり、モデルがmedium/3000で実生成完了する証拠ではない。実usage、reasoning内訳、length率、計画/審査の欠落率を最初の承認済み実測で確認する。上限変更・effort低下で見かけの容量合格にはしない。

## 7. 実transportのオフライン検証

HTTPアルゴリズムを独立追加。通信関数を注入し、offline guard必須。認証・環境secret読出・live entrypointは設けていない。現行engineには本番接続していない。

- URLはhttps://api.groq.com/openai/v1/chat/completionsに固定、POSTのみ、redirect:error、返却URL/redirectedも検査。
- timeoutはheadersとbody読込の双方に適用。abortを無視する通信関数でも送信不明として全体停止。遅延応答で台帳を書き換えない。
- 429/HTTP異常/usage不明/未完成/JSON異常は全体停止。自動retryなし。
- 送信前にattemptIdとrequestHashをfsync保存。同じdirectoryの排他lock、期限なし。再起動後も二重送信・未解決送信を拒否。
- 応答/usageを永続化してからengineへ返す。保存失敗時はhalt、halt保存も失敗したらlock保持。別商品も停止。
- settled usageの破損拒否。engine接続モックでready2通信・cache0通信・異常時公開なしを検証。

限界：OS firewallの証明、認証付き実HTTP、別host/別directoryの組織共有同期は未実施。HTTP journalは送信重複抑止で、token予算は既存engine/admission台帳の責務。live runnerへ接続する際は両者のattemptId/usageを照合し、片側のみ保存されたら再送せず手動照合する。今回のテストだけで分散共有台帳完成とはしない。

## 8. 旧新版20商品

完全原文の保存候補は異なる商品コード17件。live-search-sourcesを優先しsession-sourcesから別商品7件を採用。4項目の原文、元記録、出典、hash、将来用conditions={}をcomparison.jsonへ凍結。
これは既存34件への欠落補完ではない。別の完全な保存記録を独立候補として保持した。

20商品には3商品不足。ただし17も旧新版の比較完成組ではない。
旧出力38件を保存再利用候補として保護。既存診断によれば30件はcatchcopy再構成、8件は元catchcopy未確定。元request全体・条件も証明できないため、厳密一致の旧新版比較組は0件。
新旧で将来同じ凍結入力を使う候補17件と、過去出力で厳密比較できる0件を混同しない。
旧版実再生成は実行していない。過去出力は独立した参考品質評価には使えるが、厳密対照群には格上げしない。
旧request原本の追加取得で同一性を証明するか、将来の別承認で旧版を同じ凍結原文から生成する必要がある。その場合も旧新版合計で80以下へ再計画し、片側80を許さない。今回は旧再生成0、新生成0、許可済み実通信予算0。

## 9. 最終検証

新版既存142＋追加20＝162成功、失敗0、skip0。
既存回帰454成功、失敗0、skip0。
合計616成功、失敗0、skip0。

再現：
./scripts/rebuild/offline.sh scripts/rebuild/start-conditions-audit.cjs
./scripts/rebuild/offline.sh --test --test-isolation=none tests/rebuild/*.test.js
./scripts/rebuild/regression.sh

## 10. P3-B開始に残る条件

1. 対応tokenizer/rankとproviderの入力計上を検証できる根拠を確保。少なくとも最初の送信payloadに根拠ある入力安全上限が必要。単なる文字換算は不可。
2. 実organization/project上限・残量・他用途消費・reset・split制約をsecretなしで確定。
3. 全callerを同じ共有予算に参加させるか、検証窓では他用途停止と専有を確定。別hostのjournalを今回実装で管理済みとしない。
4. live用runnerは別承認の範囲で認証/送信/admission/journalを接続し、stage超過は未完成停止する契約を確認。今回のoffline-onlyアダプタを解除するだけで開始しない。
5. 比較段階は同条件旧出力の証明、20件不足3商品の原本、旧新版合計80以下の通信/複数日予算が必要。
6. 上記成立後に別途P3-B実通信承認。最初は1商品1工程を送り、実usageと推論/finish_reasonを照合してから次工程へ進む。未知消費時は停止。全件投入しない。

最初の容量校正用1工程と20商品比較全体の準備は別ゲート。20組不足は単一商品の容量校正を数学的に妨げる条件ではないが、現行P3-B計画から分離する場合は明示的に対象を確定する。実usageがないこと自体を最初の実測の循環禁止条件にはしない。
同じ換算を再試験しても残条件は解消しない。次の有効作業はtokenizer/計上根拠・非秘密のアカウント情報・旧request原本の取得である。

## 公開一次資料（2026-10-29閲覧）

- https://console.groq.com/docs/rate-limits : 公開Free例、organization scope、ITPM/OTPM、header単位
- https://console.groq.com/docs/api-reference : Chat endpoint、max_completion_tokens、medium、schema
- https://console.groq.com/docs/reasoning : 推論が出力tokenに含まれること、出力形式とeffort

実アカウント確認はしていない。公開値を実残量として採用していない。
