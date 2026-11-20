# 固定2商品比較の公式残量証拠

[公式仕様の監査](./official-capacity-audit-stage2.md)に基づき、ネットワークを使わず、保存した公式画面または応答ヘッダーを取り込む。残量取得目的で新規の生成リクエストを送らない。

1. Groq Consoleで組織・プロジェクト・モデル・キーの所属、Free契約と課金設定、組織とプロジェクトそれぞれの制限を照合する。RPM・RPD・TPM・TPDについて、対象範囲で有効な上限、画面に明示された現在残量とリセット時刻を確認する。現在残量が表示されない列は `null` とする。利用履歴や上限から引き算しない。画面と照合できる原本をアクセス制限した領域に保存する。秘密鍵、APIキー、認証ヘッダーを保存しない。
2. 原本を直接確認した担当者が、下の形式に転記する。観測日時は採取時、キー指紋は実行に使うキーのSHA-256。Free無課金、他利用の排他、未解決送信0は担当者が照合できた場合に入力する。Console原本の目視照合と、運用上の排他確認は署名者の責任で行う。
3. 許可済みの既存応答を使う場合は `source:"groq_headers"` とし、公式の `x-ratelimit-{limit,remaining,reset}-{requests,tokens}` だけを値が文字列のJSONオブジェクトとして保存する。観測日時は応答を受け取った時刻。RPDとTPMだけが取得対象で、RPM・TPDは全項目 `null`。この方法のみでは送信条件を満たさない。現行監査では4項目の現在残量を無消費で取得できる公式APIは確認できていない。
4. オフライン取り込み後、正規化された payload と原本を照合し、証拠署名用のEd25519鍵で署名する。署名対象は payload の JSON.stringify のUTF-8。エンベロープは `{payload,signature}`、署名値はbase64。実行側は `--evidence` と `--artifact` で署名と原本を照合する。原本、転記、署名ファイルはGitに置かない。

```sh
node scripts/rebuild/run-paired-comparison.cjs --action import-evidence \
  --observation /isolated/private/observation.json \
  --artifact /isolated/private/console-capture.pdf
```

```json
{
  "source": "groq_console",
  "verifiedAt": "2026-11-20T08:00:00.000Z",
  "account": {"organization": "example", "project": "example", "credentialSha256": "<64桁のSHA-256>"},
  "model": "openai/gpt-oss-120b",
  "plan": null,
  "billable": null,
  "exclusiveWindow": false,
  "unresolvedSends": null,
  "counters": {
    "rpm": {"limit": null, "remaining": null, "resetAt": null},
    "rpd": {"limit": null, "remaining": null, "resetAt": null},
    "tpm": {"limit": null, "remaining": null, "resetAt": null},
    "tpd": {"limit": null, "remaining": null, "resetAt": null}
  }
}
```

4項目に十分な残量があり、証拠が60秒以内で、リセットまで10秒を超える場合だけ予約に進む。容量v2は各分窓・日窓でリクエストとトークンが終了時刻を共有するため、それぞれの公式時刻が一致しない場合は送信前に停止する。DBに確認窓を設定するときは、全体の公式残量とローカルの消費・予約を重複計上しない。停止解除には同じ原本照合に加え、未解決試行の根拠付き照合が必要。

GitHub Actionsの検証では使い捨てPostgreSQLに両SQLを適用し、既存送信器のDB呼出しをservice_roleで実行する。テスト用のオーナー識別と模擬トランスポートを使用する。隔離Supabase Authへの接続確認とは別の検証である。
