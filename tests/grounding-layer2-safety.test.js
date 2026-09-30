'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildTokenizer, validateSentence, SECOND_LAYER_WORDS, DICTIONARY_POLICY } = require('../lib/room-post-grounding-policy-v1');

(async () => {
  assert.equal(DICTIONARY_POLICY.dictionary, 'IPADIC');
  assert.equal(SECOND_LAYER_WORDS.size, 0, 'Layer 2 must remain empty until corpus threshold review is complete');

  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'grounding-layer2-safety.json'), 'utf8'));
  const tokenizer = await buildTokenizer();
  const results = { ok: [], weak: [], ng: [] };

  for (const row of fixture.ok) {
    const actual = validateSentence(tokenizer, row);
    results.ok.push({ name: row.name, expected: 'pass', actual });
    assert.equal(actual.pass, true, `OK must pass: ${row.name}: ${JSON.stringify(actual)}`);
  }

  for (const row of fixture.weak) {
    const actual = validateSentence(tokenizer, row);
    results.weak.push({ name: row.name, expected: 'pass-safety-only', actual });
    assert.equal(actual.pass, true, `Weak must remain safety-valid: ${row.name}: ${JSON.stringify(actual)}`);
  }

  for (const row of fixture.ng) {
    const actual = validateSentence(tokenizer, row);
    results.ng.push({ name: row.name, expected: 'delete', actual });
    assert.equal(actual.pass, false, `NG must be deleted: ${row.name}`);
    assert.equal(actual.violation, 'UNGROUNDED_CONTENT_WORD', `Wrong violation: ${row.name}`);
  }

  console.log('GROUNDING_LAYER2_SAFETY ' + JSON.stringify(results));
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
