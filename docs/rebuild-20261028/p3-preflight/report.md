# P3-B開始前：容量予約・オフライン検証

2026-10-28 JST。判定：**容量ゲート未合格／P3-B保留**。

## 開始状態・範囲

ローカル `/workspace/scratch/1d246d5b49d6/urenavi` に前回資産を確認。
ブランチ `rebuild/urenavi-core-20261028`、開始HEAD `9a8d22f4b1dac97ec760fbbaf1cf27daad0dbd08`、開始時未コミット変更なし。AGENTS.mdは/workspace内検索では見つからなかった。
P1実装契約、P3-A報告、コード、テスト、凍結入力、容量証拠を確認した。mainからの再構築なし。
最終コミットは本報告を含む `git log -1` で確認する。

## 変更ファイルと設計判断

- lib/urenavi-core/admission.js：独立したモデル／リクエスト／日次／他用途／RPM／TPM判定。副作用なし。
- lib/urenavi-core/local-engine.js：新admissionを既存の排他・永続台帳・送信マーカーへ接続。コード版hashへ新モジュールも含める。既存台帳の無断移行禁止。通信遮断guard必須。
- tests/rebuild/admission.test.js：新規36件。既存core.test.jsの71件は変更せず維持。
- scripts/rebuild/preflight-audit.cjs：44商品を完全／不完全に分けて算定。旧監査器を再実行せずP3-A証拠を保護。
- 本ディレクトリ：テストログ、商品別容量、隔離／import証拠、本報告。

新しい経路は `run({..., admission, clock})`。admissionは全工程のinput予算を明示し、outputは常に3000。例示のinput各5000は「出力3000から導いた将来入力」ではなく、超過時に送信しない実験予算上限。4工程32000／2工程16000は予算であり予測でも全工程成功の保証でもない。工程を省略した分の予約は最終保存時に解放する。

実トークナイザ・provider形式の検証がないため、現在のadmissionは **offline-syntheticのみ**。live等はcapacity_unverifiedで拒否。未指定経路はP3-A互換の過大envelopeを保持するが、これもguard必須の旧モック検証用であり、実通信へ使えない。旧経路の残存を容量解消と数えない。

## 旧方式の監査と改訂の根拠

旧capacityPlanはWRITE_SCHEMAの全欄を最大長の漢字で埋め、最大64件の失敗理由とともにrequestを構築。これは3000出力制限と両立する保証のない仮想データで、4工程合計207295〜223611は必要量の予測ではない。

同一payload内でschemaが二重に足されるコードは確認しなかった。複数工程で原文・schemaが再登場するのは実際に再送するためであり、単純に除去できない。文字数推計とトークン上限を同一単位の確定量として扱えない点、将来入力の最大値の構築が過大な点が主問題。

| 工程 | 固定指示・schema | 原文・条件 | 引継ぎ | 出力予約 |
|---|---|---|---|---|
| draft | WRITE_PROMPT／WRITE_SCHEMA | 全原文4フィールド、generationConditions | なし | 3000 |
| review | REVIEW_PROMPT／REVIEW | 同上 | candidate=内部計画＋product＋全文sentences | 3000 |
| rewrite | WRITE_PROMPT／WRITE_SCHEMA | 同上 | feedback.previous=前候補全体、最大64件のfailures、repair指示 | 3000 |
| rereview | REVIEW_PROMPT／REVIEW | 同上 | 書き直しcandidate全体 | 3000 |

審査結果全体はrewriteへ渡していない。機械／AI検査から生成した失敗rule/id/detailのみを渡す。原文や計画内の引用重複は現構造に実在し、そのまま計上する。内部構造、指示、schemaは変更していない。

capacity.jsonはsystem、user、source、candidate、feedback、schemaのバイト数を記録。入れ子の列は重複しているため合算禁止と明記した。全reqのJSON.stringifyを推計対象にするのでメッセージ枠、JSON再直列化、エスケープ、付加指示も対象。HTTP JSONの全bytesが実モデル入力tokenと同一になるとは主張しない。

入力推計は従来のASCII/4＋非ASCII×1.4＋500。500は既存の便宜的余裕で、校正された安全上限ではない。tiktoken／transformers／tokenizersはPython環境で未導入。対応するモデルtokenizer／Groqのchat template・schema計上方法は未検証。従って推計はオフライン比較専用、実送信許可の根拠にしない。

## 独立判定・永続化

1. 入力上限、出力上限、input+outputのcontext上限を判定。
2. perRequestを独立判定。
3. 各送信直前に既存lock内でRPM／TPM判定し、eventとsent_unknownをtransportより前に永続化。
4. 日次は固定されたday/snapshot内でspent＋全工程reserved＋otherTokens、requests＋最大4＋otherRequestsを判定。
5. 他用途の日次・窓内利用は明示必須。snapshot期限到達で停止。実アカウント値を既定値で補完しない。
6. 実験tokens/requests/perCallTokensは従来limitsでも別途検査。

local windowは応答受領後60秒間、実usageへ縮めず送信時予約量を保持する保守的方式。境界はnow-finished<60000。pendingは期限なしで全体停止。これはproviderの窓実装の再現を主張しない。

時刻逆行、snapshot失効、台帳の件数／重複ID／usage合計不整合、保存失敗は拒否。クラッシュlockは自動解除なし。sent_unknownは他商品も停止。未送信の予約は取消可能だが、送信マーカー後の取消・自動再送は不可。取消を模擬する純粋台帳テストと、完了時の未使用予約解放を確認。

新方式でも将来payloadがstage予算を超えれば途中で停止し、outputを公開しない。4工程完遂の確実性は未証明。このためP1の「全段階成立の見込み」を実通信について満たしたとは判定しない。stage予算を根拠ある将来入力上限に置き換えられるかは次の検証課題。

## 公式資料と未確定制約

2026-10-28に公開資料を閲覧。推論API呼出なし。

- https://console.groq.com/docs/rate-limits ：組織単位で各種制限が適用され、別の入力／出力毎分制限がある組織もある。キャッシュ控除は見込まず全量予約。
- https://console.groq.com/docs/models ：gpt-oss-120bの公開context 131072、max completion 65536。実装の出力予約は3000を維持。

公開モデル仕様と実アカウント枠は別。実アカウント上限／残量／reset時刻／他用途の同期／ITPM・OTPM有無／provider予約計算法は未確認。独立ITPM・OTPM対応は今回未実装であり、適用アカウントでは開始不可。日次dayは自動繰越しせず期限付きsnapshotを要求。全組織で固定された台帳の所在・他用途参加も未確認。従って新方式は実共有枠を保護できると認定していない。

## テスト・隔離

- 既存新版：71成功。
- 新規admission：36成功。
- 新版合計：107成功、失敗0、skip0。
- 既存回帰：454成功、失敗0、skip0。
- 全合計：561成功、失敗0、skip0。

初回新規テストで時計の進め方が応答受領後窓の仕様と不一致だったため、テスト時計を修正した。製品の窓を短縮して通過させていない。最終ログはnew-tests.tap／regression-tests.tap。

再現：

```sh
./scripts/rebuild/offline.sh --test --test-isolation=none tests/rebuild/core.test.js tests/rebuild/admission.test.js
./scripts/rebuild/regression.sh
./scripts/rebuild/offline.sh scripts/rebuild/preflight-audit.cjs
```

テストは明示的な合成usage／モック応答。実Groq通信0、DB接続0。環境はPATH/HOME/LANGのみを新版へ渡した。秘密情報を読み出していない。既知Nodeネットワーク入口は既存guardで遮断し、既存回帰は専用guardを子Nodeへ継承。OS firewallや悪意あるnative addonの遮断証明ではない。

本番コード、main、Production、DB/RLS、認証、決済、既存ユーザーデータ、既存キャッシュの変更なし。push／PR／Preview／デプロイなし。

## 商品別容量と判定

capacity.jsonに全44商品を記録。完全10件のみ実原文で初稿payload構築、うち推計合計8000以内は5件、超過5件。初稿予約推計範囲はP3-A同様6423〜10502。

将来3工程は実生成候補が存在しないため、短いfixture構造を代入した参考推計と明記し、商品別の予測・実測とはしていない。実将来入力は不明。実際のstage容量検査は候補取得後に全文payloadで行う。

不完全34件はmissing欄にcatchcopyを記録し、payload未構築、工程推計／経路予算はnull。欠落を空文字に変換して実行していない。

容量ゲート：**未合格**。予算方式と停止動作のオフライン検証は成功。実payload全工程の成立、正確なtoken計上、実アカウント枠が不明なので実通信許可0件。
旧版平均9774.82と予約値による削減率は算出せず、平均2222.22達成・実文章品質改善・無料枠成立・ウレナビ完成は主張しない。

## P3-B前の残条件

- provider互換tokenizerとメッセージ／schema／推論tokenを含む計上の確認・校正。
- 3000出力で内部構造が成立するか、全工程の実payload成立見込みの証拠。
- 実アカウント制限・残量・他用途・snapshot期限・ITPM/OTPM確認。
- 組織で固定された共有台帳・外部消費同期・日次更新手順。
- 許可先限定実adapterと不明応答停止のオフライン検証。今回adapterは作成せずliveを拒否。
- 旧新版完全一致の比較20商品凍結、実payload別予算・総上限、別途明示承認。

P3-Bへ進んでいない。
