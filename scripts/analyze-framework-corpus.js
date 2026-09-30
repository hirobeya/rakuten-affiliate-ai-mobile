'use strict';

const fs = require('node:fs');
const path = require('node:path');
const kuromoji = require('kuromoji');

const FIXTURE_DIR = path.join(__dirname, '..', 'tests', 'fixtures');
const FILE_RE = /^rakuten-large-genres-20260925-.*\.json$/;
const TOKENIZER_DICTIONARY = 'kuromoji standard IPADIC';

const FIXED_FRAMEWORK_WORDS = new Set([
  '人','時','とき','場合','こと','もの','ため','方','向け',
  'する','いる','ある','なる','できる','使う','探す','選ぶ','欲しい','気になる'
]);

const ABSTRACT_EXCLUDES = new Set([
  '便利','おすすめ','魅力','人気','高評価','最強','最高','安心','快適','簡単','楽','おしゃれ'
]);

// These are not automatically excluded solely because they are frequent.
// They are flagged because allowing them without source grounding would assert
// product performance/specification/quality. Final layer-2 admission must also
// survive the negative-fixture validator test.
const PERFORMANCE_RISK_TERMS = new Set([
  '軽量','大容量','防水','静音','収納','高品質','省スペース'
]);

const ALLOWED_POS = new Set(['名詞','動詞']);
const EXCLUDED_NOUN_DETAILS = new Set(['数','非自立','代名詞','接尾','特殊']);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[\u3000\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadCorpus() {
  const files = fs.readdirSync(FIXTURE_DIR).filter((name) => FILE_RE.test(name)).sort();
  const docs = [];
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8'));
    for (const genre of parsed.genres || []) {
      // In this fixed corpus each genre record is the top-level Rakuten genre
      // bucket used to build the fixture. Child item.genreId is never used as
      // cross-genre evidence because it would inflate genre diversity.
      const topGenreId = String(genre.genreId || '');
      const topGenreName = String(genre.nameJa || '');
      for (const item of genre.items || []) {
        const text = normalizeText([item.itemName, item.catchcopy, item.description].filter(Boolean).join(' '));
        docs.push({
          file,
          topGenreId,
          topGenreName,
          itemGenreId: String(item.genreId || ''),
          itemCode: String(item.itemCode || ''),
          text,
        });
      }
    }
  }
  return docs;
}

function buildTokenizer() {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: path.join(__dirname, '..', 'node_modules', 'kuromoji', 'dict') })
      .build((err, tokenizer) => err ? reject(err) : resolve(tokenizer));
  });
}

function baseForm(token) {
  const basic = token.basic_form && token.basic_form !== '*' ? token.basic_form : token.surface_form;
  return normalizeText(basic).toLowerCase();
}

function isCandidate(token, term) {
  if (!term || term.length < 2) return false;
  if (!ALLOWED_POS.has(token.pos)) return false;
  if (token.pos === '名詞' && EXCLUDED_NOUN_DETAILS.has(token.pos_detail_1)) return false;
  if (FIXED_FRAMEWORK_WORDS.has(term)) return false;
  if (ABSTRACT_EXCLUDES.has(term)) return false;
  if (/^[\d\W_]+$/u.test(term)) return false;
  if (/^(する|いる|ある|なる)$/u.test(term)) return false;
  return true;
}

function thresholdPass(row, minTopGenreCount, minDocRate) {
  return row.topGenreCount >= minTopGenreCount && row.docRate >= minDocRate;
}

async function main() {
  const docs = loadCorpus();
  const tokenizer = await buildTokenizer();
  const stats = new Map();
  const topGenreMap = new Map();

  for (const doc of docs) {
    if (!topGenreMap.has(doc.topGenreId)) {
      topGenreMap.set(doc.topGenreId, { genreId: doc.topGenreId, genre: doc.topGenreName, itemCount: 0 });
    }
    topGenreMap.get(doc.topGenreId).itemCount += 1;

    const seen = new Map();
    for (const token of tokenizer.tokenize(doc.text)) {
      const term = baseForm(token);
      if (!isCandidate(token, term)) continue;
      if (!seen.has(term)) seen.set(term, new Set());
      seen.get(term).add(token.pos);
    }

    for (const [term, posSet] of seen) {
      if (!stats.has(term)) {
        stats.set(term, { term, docCount: 0, topGenres: new Set(), pos: new Set() });
      }
      const row = stats.get(term);
      row.docCount += 1;
      row.topGenres.add(doc.topGenreId);
      for (const pos of posSet) row.pos.add(pos);
    }
  }

  const totalDocs = docs.length;
  const totalTopGenres = topGenreMap.size;
  const rows = [...stats.values()].map((row) => ({
    term: row.term,
    pos: [...row.pos].sort(),
    docCount: row.docCount,
    docRate: Number((row.docCount / totalDocs).toFixed(6)),
    topGenreCount: row.topGenres.size,
    topGenreRate: Number((row.topGenres.size / totalTopGenres).toFixed(6)),
    performanceRisk: PERFORMANCE_RISK_TERMS.has(row.term),
    topGenreIds: [...row.topGenres].sort(),
  })).sort((a, b) => b.topGenreCount - a.topGenreCount || b.docCount - a.docCount || a.term.localeCompare(b.term, 'ja'));

  const topGenreDistribution = [...topGenreMap.values()]
    .sort((a, b) => b.itemCount - a.itemCount || a.genreId.localeCompare(b.genreId));

  // Grid is descriptive only. It does not choose the final threshold.
  // Final threshold must be chosen from the observed distribution, never to
  // admit a desired individual term.
  const thresholdGrid = [
    { minTopGenreCount: 4, minDocRate: 0 },
    { minTopGenreCount: 6, minDocRate: 0 },
    { minTopGenreCount: 8, minDocRate: 0 },
    { minTopGenreCount: 10, minDocRate: 0 },
    { minTopGenreCount: 12, minDocRate: 0 },
  ];

  const grid = thresholdGrid.map((t) => ({
    ...t,
    candidateCount: rows.filter((r) => thresholdPass(r, t.minTopGenreCount, t.minDocRate)).length,
    boundarySample: rows.filter((r) => Math.abs(r.topGenreCount - t.minTopGenreCount) <= 1).slice(0, 50),
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    tokenizer: {
      library: 'kuromoji',
      dictionary: TOKENIZER_DICTIONARY,
      dictionaryChangePolicy: 'Any dictionary change requires full layer-2 recalculation, all fixture reruns, and the 50-product Groq batch rerun.',
    },
    corpus: {
      fixturePattern: FILE_RE.source,
      totalDocs,
      totalTopGenres,
      note: 'The fixed corpus uses the fixture top-level genre record as the aggregation bucket; item.genreId is intentionally ignored for genre-frequency evidence. Current fixtures primarily contain itemName; catchcopy/description are consumed when present and this limitation must be reported.',
    },
    topGenreDistribution,
    fixedFrameworkWords: [...FIXED_FRAMEWORK_WORDS],
    abstractExcludes: [...ABSTRACT_EXCLUDES],
    performanceRiskTerms: [...PERFORMANCE_RISK_TERMS],
    thresholdPolicy: {
      primaryMetric: 'topGenreCount',
      secondaryMetric: 'docRate',
      rule: 'Choose from the corpus distribution before reviewing individual desired words. A term that asserts performance/specification/quality when absent from input is rejected even if it clears the frequency threshold.',
    },
    thresholdGrid: grid,
    allCandidates: rows,
  };

  const out = path.join(__dirname, '..', 'tests', 'reports', 'framework-corpus-report.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  // Keep logs compact. Full candidate data is emitted as an artifact by CI.
  console.log('FRAMEWORK_CORPUS_SUMMARY ' + JSON.stringify({
    tokenizer: report.tokenizer,
    corpus: report.corpus,
    topGenreDistribution,
    thresholdGrid: grid.map(({ minTopGenreCount, minDocRate, candidateCount }) => ({ minTopGenreCount, minDocRate, candidateCount })),
    top30Candidates: rows.slice(0, 30),
  }));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
