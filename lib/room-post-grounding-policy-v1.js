'use strict';

const path = require('node:path');
const kuromoji = require('kuromoji');

// Layer 1: hand-maintained grammar/framework vocabulary only.
const FRAMEWORK_WORDS = new Set([
  '人','時','とき','場合','こと','もの','ため','方','向け',
  'する','いる','ある','なる','できる','使う','探す','選ぶ','欲しい','気になる'
]);

// Layer 2 is deliberately empty until the 780-item corpus report is reviewed and
// a threshold is chosen from the distribution. Never hand-add a word here.
const SECOND_LAYER_WORDS = new Set([]);

const DICTIONARY_POLICY = Object.freeze({
  tokenizer: 'kuromoji',
  dictionary: 'IPADIC',
  changeRequires: ['recalculate-layer2','rerun-all-fixtures','rerun-groq-50']
});

const ABSTRACT_EVALUATION_WORDS = new Set([
  '便利','おすすめ','魅力','人気','高評価','最強','最高','安心','快適','簡単','楽','おしゃれ'
]);

function normalize(value='') {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g,'').trim();
}

function buildTokenizer() {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: path.join(__dirname, '..', 'node_modules', 'kuromoji', 'dict') })
      .build((err, tokenizer) => err ? reject(err) : resolve(tokenizer));
  });
}

function baseForm(token) {
  const basic = token.basic_form && token.basic_form !== '*' ? token.basic_form : token.surface_form;
  return normalize(basic);
}

function isTargetPos(token) {
  if (token.pos === '名詞') {
    return ['一般','固有名詞','サ変接続','形容動詞語幹'].includes(token.pos_detail_1);
  }
  if (token.pos === '形容詞') return true;
  if (token.pos === '動詞') return token.pos_detail_1 === '自立';
  if (token.pos === '副詞') return true;
  return false;
}

function isFramework(term) {
  return FRAMEWORK_WORDS.has(term) || SECOND_LAYER_WORDS.has(term);
}

function safePartialMatch(outputTerm, inputTerm) {
  if (!outputTerm || !inputTerm) return false;
  if (outputTerm === inputTerm) return true;
  // Only output ⊂ input is allowed. Never allow input ⊂ output.
  if (outputTerm.length >= 2) return inputTerm.includes(outputTerm);
  // One-character partial matching is only allowed for a kanji constituent.
  return /^\p{Script=Han}$/u.test(outputTerm) && inputTerm.includes(outputTerm);
}

function stemEquivalent(outputTerm, inputTerm) {
  // Deterministic support for examples such as 折りたたむ <- 折りたたみ / たたむ <- 折りたたむ.
  const strip = (s) => s.replace(/[いうくぐすつぬぶむる]$/u, '').replace(/み$/u, 'む');
  const a = strip(outputTerm);
  const b = strip(inputTerm);
  return a.length >= 2 && b.length >= 2 && (a === b || b.includes(a));
}

function extractInputTerms(tokenizer, inputText) {
  const terms = new Set();
  for (const token of tokenizer.tokenize(String(inputText || ''))) {
    const term = baseForm(token);
    if (!term) continue;
    terms.add(term);
  }
  return terms;
}

function termGrounded(term, inputTerms) {
  if (isFramework(term)) return true;
  for (const source of inputTerms) {
    if (safePartialMatch(term, source) || stemEquivalent(term, source)) return true;
  }
  return false;
}

function validateSentence(tokenizer, { inputText, sentence }) {
  const inputTerms = extractInputTerms(tokenizer, inputText);
  const violations = [];
  const checked = [];

  for (const token of tokenizer.tokenize(String(sentence || ''))) {
    if (!isTargetPos(token)) continue;
    const term = baseForm(token);
    if (!term) continue;
    checked.push({ term, pos: token.pos, detail: token.pos_detail_1 });
    if (ABSTRACT_EVALUATION_WORDS.has(term) && !inputTerms.has(term)) {
      violations.push(term);
      continue;
    }
    if (!termGrounded(term, inputTerms)) violations.push(term);
  }

  return {
    pass: violations.length === 0,
    violation: violations.length ? 'UNGROUNDED_CONTENT_WORD' : null,
    words: [...new Set(violations)],
    checked
  };
}

module.exports = {
  FRAMEWORK_WORDS,
  SECOND_LAYER_WORDS,
  DICTIONARY_POLICY,
  ABSTRACT_EVALUATION_WORDS,
  buildTokenizer,
  validateSentence,
  safePartialMatch,
  stemEquivalent
};
