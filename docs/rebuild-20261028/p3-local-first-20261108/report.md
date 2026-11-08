# ウレナビ 通常生成優先・限定統合結果（2026年11月8日）

判定：未完成。通常生成の共通改善と通信しない補助ルートを実装したが、高品質文章の安定生成は未達。実Groq通信0回。生成成功・機械ゲート・6軸品質の合格を区別する。

## 1. 基準・変更範囲

開始HEAD：7774e5b66274ced2c00931ce26ff6c9d8c9fe4a4。指定ブランチをcloneし作業tree cleanを確認。GitHub combined statusのVercelはsuccess、既存PreviewはREADY・target=null・同SHA。PRイベント限定のworkflow取得は空だったため、pushのCIを別途照会した。最新CIと配備SHAは作業終了報告に記載する。

既存ローカル経路は api/room-ai-v3.js の localZeroCall → local-partner-reasoner → local-generic-reasoner / partner-decision-kernel → source/conflict/safety/benefit/restatement/catalogue拒否。旧AI経路は同APIのV3 engine、別の再構築中核はurenavi-core/contracts/local-engine。後者のlocal-engineという名前は「Groqなし文章生成」を意味せず、mock transportの4工程実験runnerである。

変更は既存3ファイルへの内部オプション追加、非通信のlast-resort/editorial-budget、精算観測証跡、専用Preview、監査・テスト。既存のHTTP通常経路から内部オプションを指定する入口は追加していない。通常モード・量産モードとも同じ拒否基準を使い、既存成功結果を優先再利用。旧product/sentences、品質基準、verified identity/cache、履歴・採用記録、claim/容量runnerは保持。本体UIや本番への切替はしていない。

## 2. 確認した問題と原因

44商品の保存入力を再利用。機械的な段階別分類で未生成38件はA6/B11/D12/F9。これは既存diagnosticsの分類であり、全38件の商品情報自体が不足すると断定した根本原因の確定ではない。C/E/G/Hが独立集計されなかったことも、それらの問題が不存在という意味ではない。

確認できた共通不具合は、(1)商品名に続く完全な操作説明が箇条書き・句点なしであるため候補にならない、(2)最後に必ず拒否される仕様の言い直しがランキングで先に選ばれ、原文の使用説明を押しのけること。商品理解が未確定の場合は既存の保留を維持した。

## 3. 実際の限定改善

既存の抽出器にeditorial内部オプションを追加。明示した商品見出しの後にある「…を上げる/開ける/押す/引くと、…可能」等の完全な操作→用途の説明だけを原文引用付きで扱う。他商品・別売・関連商品の範囲、否定、販売者の行為、既存リスク語に該当する場合は拒否。可能→可能ですという終止の整形だけを行い、未確認効果や利用体験を合成しない。

同じオプションで最終catalogue/restatement拒否をランキング前にも適用する。拒否基準の緩和や個別商品コード分岐ではない。既存合格結果があれば修正経路に入らない。

## 4. 変更前後と6軸評価

例：e-kurashi:10019512。
変更前：投稿文なし。高さ40cmの仕様紹介が優先され、購入理由の完成条件を満たさず保留。
変更後：「収納ベンチは、座部を上げると、内部に物を収納可能です。」（価格と広告表示は従来どおり）。
根拠：「座部を上げると、内部に物を収納可能」。新たな即時性・狭い部屋への適合・収納量を加えていない。
編集評価：理解/具体性/根拠は充足、購入理由/場面/魅力は弱い。生成可能になったことを高品質完成と扱わない。

44件で既存ゲートreadyは5→6件（11.36%→13.64%）。既存5件の本文は完全一致、失われたready0件。通常/量産は全44件で同一本文。新規改善は1商品で、他ジャンルへの改善効果はまだ実証されていない。

出力6文を単独assistantが凍結原文に照らして編集評価。6軸全passは変更前後とも2/44（4.55%）、根拠外と判断した主張は出力6文で0件。これは別評価者/盲検/顧客試験ではなく、商品性能の独立実証でもない。残38件を根拠外0の分母に加えない。詳細はeditorial-review.json、原文・前後文はevaluation.json。

## 5. Groq最終手段の条件と回数

last-resort.assessは、通常生成の再利用、改善2工程完了、D/Fの文章不足、検証済みpackage、同一source/package、期限内証拠、改善期待の具体的根拠、キャッシュなし、個人/組織容量、Free/費用、永続claim、重複なし、監査、未知消費なし、審査予約・審査可能性を全て必要とする。数値予算計算も成功しない限り候補にならない。A/B/C/E/G/Hの原因をGroqに流さない。

今回のモジュールは準備専用で、全条件が揃ってもsendEnabled=false。writer最大1、自動再試行0。実transport・資格情報・DB/Blob書込みを持たない。既存の永続claim/429/未知消費/保存失敗抑止は変更せず回帰検証。新しいwireを既存実送信runnerへ接続する作業は未実施であり、永続予算の原子的な個人/組織同時取得も未完成。boolean証拠だけを将来の送信許可に流用してはならない。

## 6. Groq専用入力・最小出力

既存planとreviewがあり、C.inspectを通り、所有者・対象・部位・条件・否定・程度等の審査に未解決事項がなく、文章表現等のみが不合格の場合にpackageを作る。商品名/分類/用途/特徴/根拠ID/意図/購入理由/禁止事項/前文/不合格理由/具体的弱点を入力する。

出力はsentences配列のtext/evidenceIds/featureIds/relationIdsのみ。原本product、owners、features、quotes等はサーバ側に保持。IDは動的enum、objectはadditionalProperties:false、全field required。low/mediumはeffortだけ変更して比較でき、出力上限も別変数として固定可能。今回は1000を準備時の仮設定とし、実際に収まる保証や実測の品質/消費優劣は未確認。

公式Structured OutputsとReasoning文書を確認し、GPT-OSS120Bのstrictとlow/mediumの対応を確認。ローカルSchema/正負例検証は済み。実プロバイダ受理や400解消は未確認であり「Strict実証済」としない。過去2回と同じ巨大plan再出力のwireは再送しない。

## 7. product/sentences整合

変換時に未知ID・重複・空本文・空根拠・特徴と関係の誤対応・quote不足・構造違反を拒否。原本productを保持しbindings/clausesを再構成してC.inspectへ戻す。構造が正しくてもpending_semantic_review・publication=false・copyable=false。新しい全文レビューがC.reviewに合格し、前後hashに結び付いた改善理由がなければ採用候補にしない。候補の外部公開は今回の範囲外。

重要な未達：通常生成結果からこの詳細planと意味審査証拠を自動で作る接続は存在しない。既存Groq側planのfixtureによる契約テストを、通常生成の理解精度や実Groq品質の証拠に置き換えていない。

## 8. Free・費用・精算

editorial-budgetはwriter/AI review/追加処理を別計上。writer1回、追加自動生成0回。AI reviewをGroqで行うならその通信・入力上限・出力を先に予約。Freeのみ、paid fallbackなし、使用量/現在制限/全caller不明時は拒否。個人/組織/アカウントの分・日・月予算でspent+held+新規予約を照合する。上限を勝手に設定・増額しない。単一月額1480円の決済・プランは変更なし。API以外の原価を含む採算成立は未証明。

今回のAPI費用0、Groq実使用0、採用率は未測定。採用1件当たり費用やlow/medium消費差を0と捏造しない。

2回目5729トークンは今回の正式指示による観測として、wxで新規作成したsecond-failure-observation.jsonへ追記。provider Request ID/内訳/現行journal未取得のため、認証済み精算receiptとは区別。旧6000、別歴史8000、comparison8000は保持、解放0。実消費を予約に二重加算しない。既存claim・journal・receipt・監査を一切書き換えていない。実台帳への精算完了にはprovider証拠と対応journalのreadbackが必要。

## 9. KPIと未達

優先KPI：通常生成6軸全pass率、自然さ・魅力。今回の単独編集評価は2/44、向上未実証。自動ready5→6を品質改善率に変換しない。原因別件数は上記。Groq候補0/44（詳細plan・意味審査・容量等の証拠未成立）、実使用0/44、採用率未測定。通常生成/審査のAPI費用0。既存成功への回帰なし。ただし未見商品の安定品質・実ユーザー価値・本体UIへの接続は未達。

## 10. 検証

基準既存中核506件。追加後の最終件数・CIは終了報告へ記載。ネットワーク/資格情報を遮断したoffline.shとregression.shを使用。構文、diff空白チェック、Preview handlerのproduction/他branch拒否、不正入力/posted flags拒否、非公開・非copy状態を検証。通常生成品質とテスト成功は別判定。

## 11. Preview

専用root scripts/rebuild/editorial-preview。buildは保存済み評価JSONのコピーのみ。Groq/DB/Blob/認証・決済操作を持たず、既存校正buildの自動実行を含めない。推論flagは全てdisabled。プロジェクトの保護設定は維持。実行SHA/URL/READYは配備後に確認し終了報告へ記載する。

## 12. 次に必要な作業・実測条件

通常生成の品質改善を最優先で継続。Bのidentity保留、Dの特徴→購入理由、Fの定型・冗長表現を、原文と生成候補を対にして共通原因別に改善する。既存成功を保ち、同44件と異なるジャンルで評価する。

Groq実測前に、通常生成から検証済みplanを作れること、残った不足が表現のみであること、許されたローカル改善が尽きた理由、再利用不可、低/中effortの比較計画と単独変数、最新SHA/wire-bound許可、Freeの現在制限/全体残量/ITPM・OTPM、個人/組織の原子的予算取得、永久claimと審査予約、未精算5729の証拠整合が必要。今の準備関数に実transportを足すだけで進めてはならない。

公式確認先：https://console.groq.com/docs/structured-outputs 、https://console.groq.com/docs/reasoning
