'use strict';

const fs = require('node:fs');
const path = require('node:path');
const kuromoji = require('kuromoji');

const FIXTURE_DIR = path.join(__dirname, '..', 'tests', 'fixtures');
const FILE_RE = /^rakuten-large-genres-20260925-.*\.json$/;

const FIXED_FRAMEWORK_WORDS = new Set([
  '人','時','場合','こと','もの','ため','方','向け',
  'する','いる','ある','なる','できる','使う','探す','選ぶ','欲しい','気になる'
]);

const ABSTRACT_EXCLUDES = new Set([
  '便利','おすすめ','魅力','人気','高評価','最強','最高','安心','快適','簡単','楽','おしゃれ'
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
      for (const item of genre.items || []) {
        const text = normalizeText([item.itemName, item.catchcopy, item.description].filter(Boolean).join(' '));
        docs.push({
          file,
          parentGenreId: String(genre.genreId || ''),
          genreName: String(genre.nameJa || ''),
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

function thresholdPass(row, totalDocs, totalGenres, minGenreCount, minDocRate) {
  return row.genreCount >= minGenreCount && row.docCount / totalDocs >= minDocRate && row.genreCount < totalGenres;
}

async function main() {
  const docs = loadCorpus();
  const tokenizer = await buildTokenizer();
  const stats = new Map();
  const genreSet = new Set(docs.map((d) => d.parentGenreId));

  for (const doc of docs) {
    const seen = new Set();
    for (const token of tokenizer.tokenize(doc.text)) {
      const term = baseForm(token);
      if (!isCandidate(token, term)) continue;
      seen.add(term);
    }
    for (const term of seen) {
      if (!stats.has(term)) stats.set(term, { term, docCount: 0, genres: new Set() });
      const row = stats.get(term);
      row.docCount += 1;
      row.genres.add(doc.parentGenreId);
    }
  }

  const totalDocs = docs.length;
  const totalGenres = genreSet.size;
  const rows = [...stats.values()].map((row) => ({
    term: row.term,
    docCount: row.docCount,
    docRate: Number((row.docCount / totalDocs).toFixed(4)),
    genreCount: row.genres.size,
    genreRate: Number((row.genres.size / totalGenres).toFixed(4)),
  })).sort((a, b) => b.genreCount - a.genreCount || b.docCount - a.docCount || a.term.localeCompare(b.term, 'ja'));

  const thresholdGrid = [
    { minGenreCount: 6, minDocRate: 0.01 },
    { minGenreCount: 8, minDocRate: 0.015 },
    { minGenreCount: 10, minDocRate: 0.02 },
    { minGenreCount: 12, minDocRate: 0.025 },
  ];

  const grid = thresholdGrid.map((t) => ({
    ...t,
    candidateCount: rows.filter((r) => thresholdPass(r, totalDocs, totalGenres, t.minGenreCount, t.minDocRate)).length,
    top30: rows.filter((r) => thresholdPass(r, totalDocs, totalGenres, t.minGenreCount, t.minDocRate)).slice(0, 30),
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    corpus: {
      fixturePattern: FILE_RE.source,
      totalDocs,
      totalParentGenres: totalGenres,
      note: 'Current fixed 780-style corpus primarily contains itemName; catchcopy/description are used when present. This report must not be represented as full production-input coverage when those fields are absent.',
    },
    fixedFrameworkWords: [...FIXED_FRAMEWORK_WORDS],
    abstractExcludes: [...ABSTRACT_EXCLUDES],
    thresholdGrid: grid,
    top100ByCrossGenreFrequency: rows.slice(0, 100),
  };

  const out = path.join(__dirname, '..', 'tests', 'reports', 'framework-corpus-report.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('FRAMEWORK_CORPUS_REPORT ' + JSON.stringify(report));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
