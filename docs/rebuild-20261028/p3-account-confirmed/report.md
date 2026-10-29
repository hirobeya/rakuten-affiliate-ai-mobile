# Groq実アカウント確認結果の反映・初回実測前の最終判断
2026年10月29日（日本時間）

## 1．開始・終了HEAD
開始HEAD：7052fbf456c733eaa1140c0191ea124a8bf9e508
Branch：rebuild/urenavi-core-20261028。開始時クリーン。
終了HEADは本報告を含むローカル文書コミットの完全SHAをユーザーへの報告に記載する。終了時の状態も確認する。
既存docs/rebuild-20261028の全追跡証拠を開始HEADとバイト比較し一致。証拠の上書きなし。

## 2．反映した実アカウント情報
出典：今回のユーザー指示に記載された、認証済みConsoleスクリーンショットの直接確認結果。本実行では画像を再読せず、この明示報告を反映した。公開Free値からの推測ではない。

- 確認日：2026-10-29。正確な取得時刻・有効期限は未提示。
- Organization：Personal。画面に表示された組織はPersonalのみ。
- Project：Default Project。Show all Projects有効でも表示はDefault Projectのみ。
- Project表示：No custom rate limits set for this project.
- Default Projectは組織基本上限を継承。
- model：openai/gpt-oss-120b。
- RPM30／RPD1000／TPM8000／TPD200000。
- Usage→Activity→Today、2026-10-29 UTCで、Default ProjectもAll projectsも当日のusage dataなしと表示。
- 過去10月2日・6日などに利用実績あり。

「当日の画面表示」と「現在残量」を分離した。表示される組織/project数は、APIキー・caller・実行環境の数ではない。account-observations.jsonへ確認済み値とnullを分けて保存した。実行用admissionへ実残量や安全証明として投入していない。

## 3．未確認事項
ITPM/OTPMの有無・値、現在minute/day残量、reset、未反映利用、未解決送信・予約、他caller稼働状況、専有事実は未確認。
ユーザー報告のUsage最大15分遅延とUTC表示を記録。15分経過だけでゼロ利用や枠回復を確定しない。JSTの日付とUTCのTodayも混同しない。

## 4．Groq公式回答が必要な事項
前回作成済みdocs/rebuild-20261028/p3-external-confirmation/inquiry-en.txtをそのまま再利用。新たな質問文の作り直し・送信はしない。
質問は既定の5点：strict schema込み非推論計数、framing/prefix/schema展開、初回校正の保証代替制御、rate予約とusage精算、cacheの事前控除条件。
公式資料で確定済みのcache非保証・処理後控除は維持し、初回はcache減額を見込まない。今回は同じ公式調査やtokenizer計数を再実施していない。
未取得なのは、凍結wireのprovider込み入力上限、または同等の保証制御。組織TPMが実際に8000と確認できても、この入力5000以下の根拠は増えない。問い合わせは未送信であり、サポート受付済み・回答待ちとは表現しない。

## 5．他callerの静的確認
調査はこのローカルブランチのコード・設定名・workflow定義の読取りのみ。module実行、環境変数読出、稼働API呼出、DB参照はしていない。現在のmain/Production/Previewの配備版・ログ・実環境変数の紐付けを確認したものではない。

| 経路 | コード上の根拠 | 現稼働／停止事実 |
|---|---|---|
| Vercel Production/PreviewのROOM投稿文生成 | vercel.jsonで/api/room-copy→/api/room-ai-v3?urenaviContract=1。room-copy-handler→room-semantic-provider→super-urenavi-v3-groqにGroq呼出構造 | 両環境からの利用可能性あり。配備版・現在稼働は未確認 |
| Vercelの別生成経路 | api/room-ai.jsがlegacy/router/type-wrapperをimport。api/room-ai-v3.jsがv3生成とreview-comparisonを分岐。複数処理がGROQ_API_KEY/GROQ_ROOM_MODELという設定名を参照 | 同じprojectへ紐づくか・到達条件・稼働は未確認 |
| browserの継続処理 | public/app.htmlにpageshow/visibility復帰時resumeActiveAiQueue呼出 | 開いたタブが通信する可能性を排他対象に含める。今動作中とは断定しない |
| GitHub Actions | .github/workflows/ci.ymlとroom-copy-test.ymlはpush/PR起動。node --test、audit、npm testを実行。定義中にGroq secret注入・定期推論scheduleなし。参照providerテストはfetchモック | この定義を能動Groq callerと認定する根拠なし。ただしremote実行中jobや他workflowは未確認 |
| Vercel Cron | vercel.jsonの/api/pro-cron。コードはpro-searchで検索しqueueを保存。読んだpro-search/pro-cronに直接Groq呼出なし | Cron実行中でないことは未確認。直接Groq callerと断定しない。今回DB実行なし |
| CLI/ローカル開発 | 開発serverで上記handlerを使う、providerを直接呼ぶコードがあればcallerになり得る。rebuild runnerはoffline guard必須。diagnose-fixed-copyはnetwork禁止。measure-room-top20は楽天検索であり名前だけでGroq callerとしない | 起動process・別host・手元scriptは未確認 |
| その他project外のアプリ/Playground | ローカルrepoだけでは網羅不能 | 未確認。project1件はcaller1件の証明ではない |

設定名はコードの文字列として確認しただけで、秘密値の存在・内容は読んでいない。共有枠保護は新runnerのlocal lockだけでは他hostや旧経路に及ばない。旧経路が新版の停止契約を満たすとは今回認定せず、初回は呼ばせない方式で切り分ける。

## 6．初回専有の具体的手順（今回未実施）

1. 管理者が同じGroq projectを使うProduction/Preview、開発server、CLI/script、Playground等を一覧化。秘密値比較ではなく既知の運用上の接続先管理情報を使う。不明callerが残れば専有未成立。
2. 検証期間中、全利用者の生成操作を止め、Production/Previewのウレナビtabを閉じて復帰queueの起動を避ける。これはUI側の抑止であり、サーバーからの呼出停止の証明にはならない。
3. Actionsの実行中jobと起動予定、ローカル/別hostのdev server・script・自動処理を管理者が確認。Groqへ到達するjob/processだけを、別途承認された手順で停止/完了待ちにする。コード・APIキー変更を停止手段にしない。
4. Production/PreviewのVercel Logsと管理者のcaller記録でin-flight・未完了job・不明usageを照合。利用者の操作停止だけで他のHTTP clientを排除できない場合は、管理者による実効的な受付停止・専有措置の別承認が必要。今回は本番停止も設定変更も行わない。
5. 表示遅延を考慮してUsageを再確認し、UTC期間と取得日時を記録。単なる15分待機ではなく、全caller停止/未解決解消の記録と整合させる。minute回復/reset/ITPM/OTPM不明は管理画面・公式回答で解消する。
6. 専有開始・終了、snapshot期限、管理hostとcanonical journal、承認済みwire hashを束縛し、1回分を確保。送信前には必ずprovider込み上限の根拠も必要。
7. 初回成功/429/timeoutすべてで停止とholdを維持。両台帳とprovider利用記録の照合後に、管理者が保留解除と他caller再開を決める。再送や自動再試行はしない。

## 7．容量ゲート
未合格・初回通信開始不可。
商品yukaiya:10001267、source hash 1b142873671ba6906329a4217cc8c5a2811feba46c3fa27fdefcbd8ac2854c91、wire hash ab9f962665d02755d3e2fc683969472466e2da2964e7ce0cb7a13aa3d872d053を現実装と照合し一致。
原文/schema/medium/3000/1通信/台帳・lock・停止契約は不変。既存2527token計数は再計数せず継承。入力仮予約5000＋出力3000は実TPM8000と同値でも、provider込み入力5000の根拠と残量が未確定なので送信許可に使わない。

## 8．影響
文書追加のみ。コード修正・追加モック・テスト再実行なし。前回665件成功は前回結果として維持。
実Groq推論0、DB接続/書込0、秘密値読出0、問い合わせ送信0、旧版再生成0、本番停止/設定変更0。
main/Production/決済/認証/APIキー/依存/出力契約/拒否条件変更なし。push/PR/Preview/deployなし。

## 9．次に必要な最小操作
並行して2系統だけ進める：
A. 既存英語文を公式窓口へ送信し、対象wireの保証上限/代替制御の回答を得る。ユーザー自身で送信するか、送信先を明確にして明示承認する。今回未送信。
B. TPM hover等でITPM/OTPMを確認し、実行直前の消費/resetと、上記callerの停止/未解決解消を管理者が記録する。既に確認済みの組織名・project一覧・基本上限のスクリーンショットを再提出する必要はない。

今すぐの追加実装修正は必要と判明していない。外部条件成立後、既存offline-only runnerの実認証接続と初回1通信は別承認が必要。単にUsageなしの画面を得たことではliveへ進まない。
ウレナビ完成・文章品質改善・無料枠運用成立は宣言しない。
