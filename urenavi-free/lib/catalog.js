'use strict';

const modes = new Set(['search', 'ranking', 'realtime', 'rising', 'commission', 'budget', 'detail']);

function parseQuery(input) {
  const { mode = 'search', keyword = '', genre = '', code = '', maxPrice = '' } = input;
  if (![mode, keyword, genre, code, maxPrice].every(value => typeof value === 'string')) return null;
  if (!modes.has(mode) || (genre && !/^\d{1,12}$/.test(genre))) return null;
  const phrase = keyword.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (Buffer.byteLength(phrase) > 128 || /[\p{Cc}\p{Cf}]/u.test(phrase)) return null;
  if (mode === 'detail') return /^[\w-]{1,64}:[\w-]{1,80}$/.test(code) ? { mode, code } : null;
  if (['ranking', 'realtime', 'rising'].includes(mode)) return { mode, genre };
  if (!phrase && !genre) return null;
  if (maxPrice && !/^[1-9]\d{0,8}$/.test(maxPrice)) return null;
  return { mode, keyword: phrase, genre, maxPrice };
}

function commission(price, rate) {
  return rate === null ? null : Math.round(Math.min(1000, price * rate / 100));
}

function orderProducts(products, mode) {
  if (mode === 'commission') {
    return products.filter(product => product.estimatedCommission > 0)
      .sort((a, b) => b.estimatedCommission - a.estimatedCommission);
  }
  if (mode === 'budget') return [...products].sort((a, b) => a.price - b.price);
  return products;
}

function risingProducts(current, previous) {
  if (!current.updatedAt || !previous?.updatedAt ||
      Date.parse(current.updatedAt) - Date.parse(previous.updatedAt) < 5 * 60 * 1000) return [];
  const ranks = new Map(previous.ranks);
  return current.products.map(product => ({
    ...product,
    rankGain: ranks.has(product.code) ? ranks.get(product.code) - product.rank : 0
  })).filter(product => product.rankGain > 0)
    .sort((a, b) => b.rankGain - a.rankGain || a.rank - b.rank);
}

module.exports = { parseQuery, commission, orderProducts, risingProducts };
