# Groq公式窓口への確認案（未送信）

送信・問い合わせ投稿は今回実施していない。公開資料の追加検索を反復する代わりに、下記の限定質問への回答を取得する。
公式導線：Groq DocsのDeveloper Communityリンク（https://community.groq.com/）、公式Contact（https://groq.com/contact）。Contactページの抽出結果だけでは技術窓口の送信方法までは確認できていない。利用者が既存Consoleのサポート導線を使える場合はそちらを優先する。

対象：POST /openai/v1/chat/completions、openai/gpt-oss-120b、messages=[system,user]、strict response_format json_schema、reasoning_effort=medium、max_completion_tokens=3000。tools/search/compound設定なし。
原文とschemaは凍結済み。wireHash=ab9f962665d02755d3e2fc683969472466e2da2964e7ce0cb7a13aa3d872d053。
ローカルo200k_harmonyのcontent＋schema通常テキスト計数は2527。HTTP JSON通常テキスト計数2579。これをprovider入力数とは見なしていない。

1. このAPI/modelに、推論生成を行わずmessages/response_formatを入力としてprovider prompt_tokensまたは保証された上限を返す公式手段はありますか。利用条件・endpoint・公開資料を教えてください。存在を推定して任意endpointをprobeしません。
2. role framingとassistant generation prefix、およびproviderが追加するsystem/developer指示はprompt_tokensにどう含まれますか。公開templateの版、または今回payloadに対する検証可能な追加token上限を提示できますか。
3. strict schemaはconstrained decodingだけで使われますか、それともpromptにも挿入されますか。挿入・展開・複製・schema compileのtoken計上と、schemaによる別のrate制約を教えてください。
4. RPM/TPM/ITPM/OTPM/RPD/TPDは、送信時に何を予約し、完了時に何を精算しますか。input実数、max_completion_tokens、reasoning tokens、cached tokensの関係と、失敗/429/timeout時の消費を教えてください。
5. max_completion_tokens=3000は、対象モデルの推論・最終JSON・終端を含む生成全体の上限として扱えますか。別の推論枠や課金枠がありますか。
6. exact formulaを公開できない場合、この凍結payloadの入力5000以下、総予約8000以下を保証できる代替根拠はありますか。あるいは必要な保守的上限はいくつですか。
7. minuteの補充・rolling窓と日次reset/timezone、組織とprojectの両枠の非秘密な残量確認方法、集計遅延・未解決消費の照合方法を教えてください。

APIキー、Authorization header、環境変数、認証URL、他利用者情報は添付しない。必要なら利用者が承認した公開商品payload/schemaの再現例のみ別途提示する。

回答の採用条件：対象model/API/schema/版が一致し、根拠資料または公式回答日時を記録できること。コミュニティ上の第三者の推定や「十分な余裕がある」は安全上限の証明として採用しない。
