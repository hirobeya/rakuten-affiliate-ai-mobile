'use strict';

const find = id => document.getElementById(id);
const results = find('results');
const status = find('status');
const panel = find('panel');
const selected = new Map();
const favoriteKey = 'urenavi-free-favorites-v1';
const codePattern = /^[\w-]{1,64}:[\w-]{1,80}$/;
const formatter = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', timeZone: 'Asia/Tokyo' });
const yen = value => value.toLocaleString('ja-JP') + '円';
let currentRequest;

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content !== undefined) node.textContent = content;
  if (className) node.className = className;
  return node;
}

function button(label, action) {
  const node = element('button', label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function savedCodes() {
  try {
    const value = JSON.parse(localStorage.getItem(favoriteKey) || '[]');
    return Array.isArray(value) ? value.filter(code => typeof code === 'string' && codePattern.test(code)).slice(0, 30) : [];
  } catch {
    return [];
  }
}

function track(product, event) {
  const token = event === 'view' ? product.viewToken : product.clickToken;
  if (!token || product.expires <= Date.now()) return;
  fetch('/api/catalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, code: product.code, expires: product.expires, token }),
    keepalive: true
  }).catch(() => {});
}

function buyLink(product) {
  if (product.source === 'yahoo') {
    const link = element('a', 'Yahoo!ショッピングで見る', 'buy');
    link.href = product.productUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }
  if (!product.affiliateUrl || product.expires <= Date.now()) return element('span', '購入リンクを表示できません。', 'meta');
  const link = element('a', '楽天市場で見る', 'buy');
  link.href = product.affiliateUrl;
  link.target = '_blank';
  link.rel = 'sponsored noopener';
  link.addEventListener('click', event => {
    if (product.expires <= Date.now()) {
      event.preventDefault();
      link.replaceWith(element('span', '商品情報の表示期限が切れました。再検索してください。', 'meta'));
      return;
    }
    track(product, 'click');
  });
  return link;
}

function showPanel(title, body) {
  find('panel-title').textContent = title;
  find('panel-body').replaceChildren(body);
  if (!panel.open) panel.showModal();
}

function review(product) {
  return product.reviews ? product.rating + ' / 5（' + product.reviews.toLocaleString('ja-JP') + '件）' : 'レビュー情報なし';
}

function detail(product) {
  const body = element('div');
  body.append(element('h3', product.title), element('p', yen(product.price), 'money'),
    element('p', product.shop + ' ｜ ' + review(product), 'meta'));
  if (product.description) body.append(element('p', product.description));
  body.append(buyLink(product));
  showPanel('商品情報', body);
  track(product, 'view');
}

function renderProduct(product, mode) {
  const card = element('article');
  const source = product.source === 'yahoo' ? 'Yahoo!ショッピング' : '楽天市場';
  const info = element('p', product.rank ? product.rank + '位' + (product.rankGain ? '（' + product.rankGain + '位上昇）' : '') + ' ｜ ' + source : source, 'meta');
  card.append(info, element('h3', product.title), element('p', yen(product.price), 'money'),
    element('p', product.shop + ' ｜ ' + review(product), 'meta'));
  if (product.estimatedCommission !== null && mode === 'commission') {
    card.append(element('p', '推定報酬 ' + yen(product.estimatedCommission) + '・確定報酬は楽天のレポートで確認', 'meta'));
  }

  const actions = element('div', undefined, 'actions');
  const favorite = button('お気に入り', () => {
    const codes = new Set(savedCodes());
    if (codes.has(product.code)) codes.delete(product.code);
    else if (codes.size < 30) codes.add(product.code);
    else {
      status.textContent = 'お気に入りは30件まで保存できます。';
      return;
    }
    try {
      localStorage.setItem(favoriteKey, JSON.stringify([...codes]));
      favorite.setAttribute('aria-pressed', String(codes.has(product.code)));
    } catch {
      status.textContent = 'このブラウザにお気に入りを保存できませんでした。';
    }
  });
  favorite.setAttribute('aria-pressed', String(savedCodes().includes(product.code)));
  if (product.source === 'yahoo') { favorite.disabled = true; favorite.title = 'Yahoo!のお気に入り再取得は未対応です'; }

  const compare = button('比較に追加', () => {
    if (selected.has(product.code)) selected.delete(product.code);
    else if (selected.size < 3) selected.set(product.code, product);
    else {
      status.textContent = '一度に比較できる商品は3件までです。';
      return;
    }
    compare.setAttribute('aria-pressed', String(selected.has(product.code)));
    updateCompare();
  });
  compare.setAttribute('aria-pressed', String(selected.has(product.code)));
  actions.append(button('商品情報', () => detail(product)), favorite, compare, buyLink(product));
  card.append(actions);
  return card;
}

function updateCompare() {
  find('compare-bar').hidden = selected.size === 0;
  find('compare').textContent = '選んだ商品を比較（' + selected.size + '件）';
  find('compare').disabled = selected.size < 2;
}

find('compare').addEventListener('click', () => {
  const body = element('div', undefined, 'comparison');
  const table = element('table');
  const products = [...selected.values()];
  for (const [label, getter] of [
    ['商品', item => item.title], ['取得元', item => item.source === 'yahoo' ? 'Yahoo!ショッピング' : '楽天市場'], ['価格', item => yen(item.price)],
    ['販売ショップ', item => item.shop], ['レビュー', review]
  ]) {
    const row = element('tr');
    const heading = element('th', label);
    heading.scope = 'row';
    row.append(heading, ...products.map(item => element('td', getter(item))));
    table.append(row);
  }
  const links = element('tr');
  const label = element('th', '購入先');
  label.scope = 'row';
  links.append(label);
  for (const product of products) {
    const cell = element('td');
    cell.append(buyLink(product));
    links.append(cell);
  }
  table.append(links);
  body.append(table, element('p', '送料・クーポン・最新価格は購入先でご確認ください。', 'meta'));
  showPanel('商品を比較', body);
});

async function load(query, title, provider = 'rakuten') {
  currentRequest?.abort();
  const request = new AbortController();
  currentRequest = request;
  find('results-title').textContent = title;
  results.replaceChildren();
  status.textContent = '商品情報を取得中です。';
  try {
    const response = await fetch((provider === 'yahoo' ? '/api/yahoo?' : '/api/catalog?') + new URLSearchParams(query), { signal: request.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '商品情報を読み込めませんでした。');
    if (request.signal.aborted) return;
    const items = data.products;
    if (!items.length) {
      status.textContent = query.mode === 'rising' ? '比較できる過去の順位がまだないか、順位が上がった商品がありません。' : '条件に合う商品が見つかりませんでした。';
      return;
    }
    const time = formatter.format(new Date(data.updatedAt || data.fetchedAt));
    const notes = [items.length + '件', (data.updatedAt ? '提供元更新 ' : '取得 ') + time + '（日本時間）'];
    if (query.mode === 'commission') notes.push('検索で取得した候補内の推定額順');
    if (query.mode === 'budget') notes.push('送料・割引は購入先で確認');
    status.textContent = notes.join(' ｜ ');
    results.append(...items.map(item => renderProduct(item, query.mode)));
  } catch (error) {
    if (!request.signal.aborted) status.textContent = error instanceof SyntaxError ?
      '商品情報を読み込めませんでした。' : error.message;
  }
}

find('provider').addEventListener('change', () => {
  const commission = find('mode').querySelector('option[value="commission"]');
  commission.disabled = find('provider').value === 'yahoo';
  if (commission.disabled && find('mode').value === 'commission') find('mode').value = 'search';
});
find('search').addEventListener('submit', event => {
  event.preventDefault();
  load({ keyword: find('keyword').value, mode: find('mode').value, maxPrice: find('price').value }, '検索結果', find('provider').value);
});
document.querySelectorAll('nav [data-mode]').forEach(node => {
  node.addEventListener('click', () => load({ mode: node.dataset.mode }, node.textContent));
});

find('favorites').addEventListener('click', () => {
  const list = element('div');
  const codes = savedCodes();
  if (!codes.length) list.append(element('p', 'お気に入りはまだありません。'));
  for (const code of codes) {
    const row = element('article');
    row.append(button('商品を表示（' + code + '）', () => {
      panel.close();
      load({ mode: 'detail', code }, 'お気に入りの商品');
    }), button('削除', () => {
      try {
        localStorage.setItem(favoriteKey, JSON.stringify(savedCodes().filter(value => value !== code)));
        row.remove();
        if (!list.children.length) list.append(element('p', 'お気に入りはまだありません。'));
        results.replaceChildren();
        status.textContent = 'お気に入りを削除しました。';
      } catch {
        list.append(element('p', 'このブラウザのお気に入りを変更できませんでした。'));
      }
    }));
    list.append(row);
  }
  showPanel('お気に入り', list);
});

const month = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', month: 'numeric' }).format());
const themes = month >= 3 && month <= 5 ? ['新生活 収納', '折りたたみ傘', 'アウトドア チェア']
  : month >= 6 && month <= 8 ? ['日傘', '冷感 寝具', '保冷バッグ']
    : month >= 9 && month <= 11 ? ['防寒 ベスト', '加湿器', '電気毛布']
      : ['防寒 手袋', '電気毛布', '乾燥対策 加湿器'];
for (const keyword of themes) {
  find('themes').append(button(keyword, () => {
    find('keyword').value = keyword;
    find('mode').value = 'search';
    find('price').value = '';
    load({ keyword, mode: 'search' }, '季節のおすすめ検索', find('provider').value);
  }));
}

// Display rank changes only after the active deployment enables rank history.
fetch('/api/catalog?mode=capabilities')
  .then(response => response.ok ? response.json() : null)
  .then(config => {
    if (config?.rising === true) document.querySelector('[data-mode="rising"]').hidden = false;
  })
  .catch(() => {});
