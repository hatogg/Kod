'use strict';
/* Імітація Android-мосту для розробки в браузері: файли в пам'яті, сховище в localStorage. */

function makeMock() {
  const TREE = 'content://mock.tree/demo-site';
  const DOC = 'content://mock.doc/';
  const now = Date.now();
  const F = {};
  const put = (id, text, extra) => { F[id] = Object.assign({ text, mtime: now - Math.round(Math.random() * 9e6) }, extra || {}); };
  const dir = id => { F[id] = { dir: true }; };

  dir('demo-site');
  put('demo-site/index.html', `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Кав'ярня «Зерно»</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="hero">
    <h1>Зерно</h1>
    <p>Кава, яку смажимо самі — щоп'ятниці.</p>
    <button id="order">Замовити</button>
  </header>

  <main>
    <h2>Меню</h2>
    <ul id="menu"></ul>
  </main>

  <script src="app.js"></script>
</body>
</html>
`);
  put('demo-site/style.css', `:root {
  --bg: #fbf7f2;
  --ink: #2b211b;
  --accent: #c8642b;
}

body {
  margin: 0;
  font: 16px/1.5 system-ui, sans-serif;
  background: var(--bg);
  color: var(--ink);
}

.hero {
  padding: 48px 24px;
  background: linear-gradient(160deg, #3b2a20, #6b3f24);
  color: #fff;
}

.hero h1 { margin: 0; font-size: 44px; letter-spacing: -1px; }

button {
  border: 0;
  border-radius: 999px;
  padding: 12px 22px;
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}

main { padding: 24px; }
#menu { list-style: none; padding: 0; }
#menu li { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e8ded4; }
`);
  put('demo-site/app.js', `// Меню кав'ярні: завантажуємо позиції і малюємо список
const menu = [
  { name: 'Еспресо', price: 45 },
  { name: 'Капучино', price: 65 },
  { name: 'Флет вайт', price: 70 },
  { name: 'Какао з маршмелоу', price: 60 },
];

function formatPrice(uah) {
  return uah.toFixed(0) + ' ₴';
}

function render(list) {
  const ul = document.getElementById('menu');
  ul.innerHTML = '';
  for (const item of list) {
    const li = document.createElement('li');
    li.innerHTML = \`<span>\${item.name}</span><b>\${formatPrice(item.price)}</b>\`;
    ul.appendChild(li);
  }
  console.log('Позицій у меню:', list.length);
}

class Order {
  constructor() {
    this.items = [];
  }

  add(name) {
    const item = menu.find(m => m.name === name);
    if (!item) throw new Error('Немає в меню: ' + name);
    this.items.push(item);
    return this;
  }

  get total() {
    return this.items.reduce((sum, i) => sum + i.price, 0);
  }
}

document.getElementById('order').addEventListener('click', () => {
  const o = new Order().add('Капучино').add('Еспресо');
  console.info('До сплати:', formatPrice(o.total));
  alert('Замовлення прийнято!');
});

render(menu);
`);
  put('demo-site/README.md', `# Кав'ярня «Зерно»

Сайт-візитка: **меню**, замовлення і контакти.

## Як запустити

1. Відкрийте \`index.html\` у «Коді».
2. Натисніть ▶ — сторінка відкриється з консоллю.

## Що треба зробити

- [x] Меню з цінами
- [ ] Форма доставки
- [ ] Темна тема

| Напій | Ціна |
|---|---:|
| Еспресо | 45 ₴ |
| Капучино | 65 ₴ |

> Смажимо каву щоп'ятниці о 9:00.
`);
  dir('demo-site/data');
  put('demo-site/data/menu.json', `{
  "updated": "2026-10-20",
  "items": [
    { "name": "Еспресо", "price": 45, "hot": true },
    { "name": "Капучино", "price": 65, "hot": true },
    { "name": "Лимонад", "price": 55, "hot": false }
  ]
}
`);
  dir('demo-site/scripts');
  put('demo-site/scripts/deploy.sh', `#!/usr/bin/env bash
# Викладання сайту на сервер
set -euo pipefail

HOST="zerno.example"
DIR="/var/www/zerno"

echo "Копіюю файли на $HOST..."
rsync -avz --delete ./ "deploy@$HOST:$DIR" --exclude scripts
echo "Готово"
`);
  dir('demo-site/tools');
  put('demo-site/tools/prices.py', `"""Перерахунок цін меню з урахуванням націнки."""
import json
from pathlib import Path

MARKUP = 1.12


def load(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)["items"]


class PriceList:
    def __init__(self, items):
        self.items = items

    def raise_prices(self, k=MARKUP):
        for item in self.items:
            item["price"] = round(item["price"] * k)
        return self


if __name__ == "__main__":
    items = load(Path("../data/menu.json"))
    for i in PriceList(items).raise_prices().items:
        print(f"{i['name']:<20} {i['price']:>4} грн")
`);
  put('demo-site/notes.txt', 'Нотатки постачальника (файл у Windows-1251)\r\nЗерно: Бразилія, Ефіопія\r\nДоставка: щовівторка\r\n', { enc: 'windows-1251', eol: 'CRLF' });
  dir('ext');
  put('ext/todo.md', `# Справи на тиждень

- Оновити меню на сайті
- Замовити зерно
`);

  let clip = '';
  const LS = {
    get: k => { try { return localStorage.getItem('mock.' + k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem('mock.' + k, v); } catch (e) {} },
    del: k => { try { localStorage.removeItem('mock.' + k); } catch (e) {} },
    keys: p => { try { return Object.keys(localStorage).filter(k => k.startsWith('mock.' + p)).map(k => k.slice(5 + p.length)); } catch (e) { return []; } },
  };
  const idOf = uri => uri.startsWith(DOC) ? decodeURIComponent(uri.slice(DOC.length)) : null;
  const uriOf = id => DOC + encodeURIComponent(id);
  const rootOf = tree => decodeURIComponent(tree.slice('content://mock.tree/'.length));
  const name = id => id.split('/').pop();
  const children = id => Object.keys(F).filter(k => k.startsWith(id + '/') && !k.slice(id.length + 1).includes('/'));
  const S = JSON.stringify;
  const emit = (fn, ...a) => setTimeout(() => window.__kod && window.__kod[fn](...a), 250);
  let lastText = null;

  return {
    hello: () => 'mock',
    info: () => S({ version: '1.0', sdk: 34, model: 'Браузер', night: matchMedia('(prefers-color-scheme: dark)').matches, debug: false }),
    encodings: () => S([['utf-8', 'UTF-8'], ['utf-16le', 'UTF-16 LE'], ['utf-16be', 'UTF-16 BE'], ['windows-1251', 'Windows-1251 (кирилиця)'], ['koi8-u', 'KOI8-U (кирилиця)'], ['cp866', 'CP866 (DOS, кирилиця)'], ['windows-1252', 'Windows-1252 (західна)'], ['iso-8859-1', 'ISO-8859-1 (латиниця-1)']]),
    pick(t, id, kind, nm) {
      if (kind === 'folder') return emit('onPick', id, { ok: true, uri: TREE, name: 'demo-site' });
      if (kind === 'save') {
        const nid = 'ext/' + (nm || 'файл.txt');
        put(nid, '');
        return emit('onPick', id, { ok: true, uri: uriOf(nid), name: name(nid) });
      }
      emit('onPick', id, { ok: true, files: [{ uri: uriOf('ext/todo.md'), name: 'todo.md' }] });
    },
    read(t, uri, enc) {
      const id = idOf(uri), f = id && F[id];
      if (!f || f.dir) return S({ ok: false, err: 'not found' });
      lastText = f.text.replace(/\r\n?/g, '\n');
      return S({ ok: true, name: name(id), size: f.text.length, mtime: f.mtime, writable: 1, enc: enc && enc !== 'auto' ? enc : (f.enc || 'utf-8'), bom: false, eol: f.eol || 'LF', mixed: false, binary: false });
    },
    text() { const s = lastText; lastText = null; return s || ''; },
    write(t, uri, text, enc, bom, eol) {
      const id = idOf(uri);
      if (!id) return S({ ok: false, err: 'access' });
      put(id, eol === 'CRLF' ? text.replace(/\n/g, '\r\n') : text, { enc, eol, mtime: Date.now() });
      return S({ ok: true, size: text.length, mtime: F[id].mtime });
    },
    unmappable: (t, text, enc) => enc === 'utf-8' || enc.startsWith('utf-16') ? 0 : (text.match(/[^\u0000-ӿ]/g) || []).length,
    stat(t, uri) { const id = idOf(uri), f = id && F[id]; return S(f ? { ok: true, name: name(id), size: (f.text || '').length, mtime: f.mtime, writable: 1 } : { ok: false }); },
    list(t, tree, id) {
      const root = id || rootOf(tree);
      const items = children(root).map(k => ({ id: k, name: name(k), dir: !!F[k].dir, size: F[k].dir ? -1 : F[k].text.length, mtime: F[k].mtime || -1 }));
      items.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
      return S({ ok: true, items });
    },
    docUri: (t, tree, id) => uriOf(id),
    rootId: (t, tree) => rootOf(tree),
    create(t, tree, parent, nm, isDir) {
      const id = (parent || rootOf(tree)) + '/' + nm;
      if (F[id]) return S({ ok: false, err: 'exists' });
      if (isDir) dir(id); else put(id, '', { mtime: Date.now() });
      return S({ ok: true, id, uri: uriOf(id), name: nm });
    },
    rename(t, tree, id, nm) {
      const nid = id.split('/').slice(0, -1).concat(nm).join('/');
      for (const k of Object.keys(F)) if (k === id || k.startsWith(id + '/')) { F[nid + k.slice(id.length)] = F[k]; delete F[k]; }
      return S({ ok: true, id: nid, uri: uriOf(nid), name: nm });
    },
    remove(t, tree, id) {
      for (const k of Object.keys(F)) if (k === id || k.startsWith(id + '/')) delete F[k];
      return S({ ok: true });
    },
    resolve(t, tree, rel) {
      const id = rootOf(tree) + (rel ? '/' + rel : '');
      return S(F[id] ? { ok: true, id, dir: !!F[id].dir, uri: uriOf(id) } : { ok: false });
    },
    treeName: (t, tree) => name(rootOf(tree)),
    find(t, jid, tree, startId, startPath, optsJson, replace) {
      const o = JSON.parse(optsJson);
      let src = o.regex ? o.q : o.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (o.word) src = '(?<![\\p{L}\\p{N}_])(?:' + src + ')(?![\\p{L}\\p{N}_])';
      const re = new RegExp(src, 'gu' + (o.cs ? '' : 'i'));
      const root = startId || rootOf(tree);
      const files = [];
      let hits = 0, scanned = 0, replaced = 0;
      for (const k of Object.keys(F).sort()) {
        if (F[k].dir || !k.startsWith(root + '/')) continue;
        scanned++;
        const lines = F[k].text.replace(/\r\n?/g, '\n').split('\n');
        const fh = [];
        let count = 0;
        lines.forEach((ln, i) => {
          const ms = [...ln.matchAll(re)];
          if (!ms.length) return;
          count += ms.length;
          fh.push({ line: i, col: ms[0].index, len: ms[0][0].length, n: ms.length, text: ln.slice(Math.max(0, ms[0].index - 60), ms[0].index + 140), off: Math.max(0, ms[0].index - 60) });
          if (replace) lines[i] = ln.replace(re, o.rep);
        });
        if (count) {
          hits += count;
          const path = k.slice(rootOf(tree).length + 1);
          if (replace) { F[k].text = lines.join('\n'); F[k].mtime = Date.now(); replaced += count; files.push({ path, uri: uriOf(k), count }); }
          else files.push({ path, id: k, uri: uriOf(k), count, hits: fh });
        }
      }
      setTimeout(() => window.__kod.onFind(jid, { done: false, scanned: 2, matched: 0, hits: 0, files: [] }), 120);
      setTimeout(() => window.__kod.onFind(jid, { done: true, scanned, matched: files.length, hits, files, replacedFiles: replace ? files.length : 0, replaced, errors: 0 }), 420);
    },
    cancel() {},
    kvPut: (t, k, v) => { LS.set('kv.' + k, v); return true; },
    kvGet: (t, k) => LS.get('kv.' + k),
    backupPut: (t, id, text) => { LS.set('bk.' + id, text); return true; },
    backupGet: (t, id) => LS.get('bk.' + id),
    backupDel: (t, id) => LS.del('bk.' + id),
    backupKeys: () => S(LS.keys('bk.')),
    clipGet: () => clip,
    clipSet: (t, s) => { clip = s; try { navigator.clipboard.writeText(s); } catch (e) {} },
    share: (t, text, nm) => console.log('[share]', nm, text.length),
    view: (t, url) => window.open(url, '_blank'),
    hash: () => '(хеш рахує Android)',
    print: (t, html) => { const w = window.open(''); if (w) { w.document.write(html); w.document.close(); } },
    previewSet(t, json) { window.__mockPreview = JSON.parse(json); },
    intent: () => '',
    bars() {},
    debug() {},
    persisted: () => '[]',
    release() {},
    exit: () => console.log('[exit]'),
  };
}
