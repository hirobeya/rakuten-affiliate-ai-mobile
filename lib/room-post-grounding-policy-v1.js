'use strict';

const path = require('node:path');
const kuromoji = require('kuromoji');

// Layer 1 is prompt-facing vocabulary. Multi-morpheme phrases such as 気になる
// are kept here as one definition and expanded by the SAME IPADIC tokenizer used
// by validation. This prevents prompt/validator drift without hand-adding token pieces.
const FRAMEWORK_WORDS = new Set([
  '人','時','とき','場合','こと','もの','ため','方','向け',
  'する','いる','ある','なる','できる','使う','探す','選ぶ','欲しい','気になる'
]);

// Layer 2 stays empty until corpus distribution + safety fixtures justify adoption.
// Never hand-add a word here.
const SECOND_LAYER_WORDS = new Set([]);

const DICTIONARY_POLICY = Object.freeze({
  tokenizer: 'kuromoji',
  dictionary: 'IPADIC',
  changeRequires: ['recalculate-layer2','rerun-all-fixtures','rerun-groq-50']
});

const ABSTRACT_EVALUATION_WORDS = new Set([
  '便利','おすすめ','魅力','人気','高評価','最強','最高','安心','快適','簡単','楽','おしゃれ'
]);

const frameworkTokenCache = new WeakMap();

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

function getFrameworkTokenTerms(tokenizer) {
  if (frameworkTokenCache.has(tokenizer)) return frameworkTokenCache.get(tokenizer);
  const terms = new Set([...FRAMEWORK_WORDS].map(normalize));
  for (const expression of FRAMEWORK_WORDS) {
    for (const token of tokenizer.tokenize(expression)) {
      if (!isTargetPos(token)) continue;
      const term = baseForm(token);
      if (term) terms.add(term);
    }
  }
  for (const term of SECOND_LAYER_WORDS) terms.add(normalize(term));
  frameworkTokenCache.set(tokenizer, terms);
  return terms;
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
  // Deterministic normalization for inflection/nominalization such as
  // 折りたたみ -> 折りたたむ and constituent たたむ <- 折りたたむ.
  const variants = (s) => {
    const out = new Set([s]);
    if (/み$/u.test(s)) out.add(s.replace(/み$/u, 'む'));
    if (/[いうくぐすつぬぶむる]$/u.test(s)) out.add(s.replace(/[いうくぐすつぬぶむる]$/u, ''));
    return out;
  };
  const a = variants(outputTerm);
  const b = variants(inputTerm);
  for (const x of a) {
    for (const y of b) {
      if (x.length >= 2 && y.length >= 2 && (x === y || y.includes(x))) return true;
    }
  }
  return false;
}

function extractInputTerms(tokenizer, inputText) {
  const terms = new Set();
  for (const token of tokenizer.tokenize(String(inputText || ''))) {
    const term = baseForm(token);
    if (term) terms.add(term);
  }
  return terms;
}

function termGrounded(term, inputTerms, frameworkTerms) {
  if (frameworkTerms.has(term)) return true;
  for (const source of inputTerms) {
    if (safePartialMatch(term, source) || stemEquivalent(term, source)) return true;
  }
  return false;
}

function validateSentence(tokenizer, { inputText, sentence }) {
  const inputTerms = extractInputTerms(tokenizer, inputText);
  const frameworkTerms = getFrameworkTokenTerms(tokenizer);
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
    if (!termGrounded(term, inputTerms, frameworkTerms)) violations.push(term);
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
  stemEquivalent,
  getFrameworkTokenTerms
};
