'use strict';
/* Інструменти: запуск і консоль, Markdown, порівняння, форматування, JSON, перетворення, хеші, список функцій, друк. */

const loadModule = name => new Promise(res => ace.config.loadModule(name, m => res(m)));

const Tools = {
  // ================================================================ запуск

  /** Збирає вміст відкритих вкладок для сервера перегляду: шлях → текст. */
  previewFiles(tab) {
    const files = {};
    const tree = tab.tree || null;
    for (const t of K.tabs) {
      if (!t.loaded) continue;
      if (tree && t.tree === tree && t.path) files[t.path] = t.session.getValue();
      else if (!tree && !t.tree) files[t.untitled ? t.name.replace(/ /g, '-') + '.' + Langs.extFor(t.mode) : t.name] = t.session.getValue();
    }
    return { tree, files };
  },

  keyFor(tab) {
    if (tab.tree && tab.path) return tab.path;
    return tab.untitled ? tab.name.replace(/ /g, '-') + '.' + Langs.extFor(tab.mode) : tab.name;
  },

  run(tab) {
    tab = tab || K.cur;
    const kind = Langs.runKind(tab);
    if (!kind) {
      UI.toast('Запуск працює для HTML, SVG, JavaScript і Markdown. Для «' + Langs.caption(tab.mode) + '» — ні.');
      return;
    }
    if (kind === 'md') return Tools.markdown(tab);
    const { tree, files } = Tools.previewFiles(tab);
    let key = Tools.keyFor(tab);
    if (kind === 'js') {
      const dir = key.includes('/') ? key.slice(0, key.lastIndexOf('/') + 1) : '';
      const module = /^\s*(import|export)\b/m.test(files[key] || '');
      const runner = dir + '__kod_run__.html';
      files[runner] = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<style>body{font:15px/1.5 system-ui,sans-serif;margin:16px;color:#333}</style></head><body>' +
        '<script' + (module ? ' type="module"' : '') + ' src="' + encodeURI(key.slice(dir.length)) + '"></script></body></html>';
      key = runner;
    }
    Native.previewSet({ tree, files });
    Tools.preview(tab, key, kind, files);
  },

  /** Повноекранний перегляд з консоллю. */
  preview(tab, key, kind, files) {
    const frame = h('iframe', {
      class: 'pframe',
      sandbox: 'allow-scripts allow-forms allow-modals allow-popups allow-same-origin allow-downloads allow-pointer-lock',
      allow: 'clipboard-write; fullscreen; geolocation; camera; microphone',
    });
    const log = h('div', { class: 'clog' });
    const input = h('input', { class: 'cinput', placeholder: 'JavaScript у контексті сторінки…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go' });
    const count = h('span', { class: 'ccount' });
    const con = h('div', { class: 'console' + (kind === 'js' || kind === 'repl' ? ' open big' : '') },
      h('button', { class: 'chead', onclick: () => con.classList.toggle('open') },
        h('span', { html: ic('terminal') }), h('b', { text: 'Консоль' }), count,
        h('span', { class: 'sp' }),
        h('span', { class: 'ib sm', html: ic('trash'), title: 'Очистити', onclick: e => { e.stopPropagation(); log.innerHTML = ''; stats = { error: 0, warn: 0, all: 0 }; badge(); } }),
        h('span', { class: 'ib sm', html: ic('layers'), title: 'Розмір', onclick: e => { e.stopPropagation(); con.classList.add('open'); con.classList.toggle('big'); } }),
        h('span', { class: 'ib sm chev', html: ic('up') })),
      log,
      h('div', { class: 'crow' }, h('span', { class: 'cprompt', text: '›' }), input));
    const body = h('div', { class: 'pv' }, frame, con);
    const title = kind === 'repl' ? 'Консоль JavaScript' : tab.name;
    let stats = { error: 0, warn: 0, all: 0 };
    const badge = () => {
      count.textContent = stats.all ? String(stats.all) : '';
      count.className = 'ccount' + (stats.error ? ' err' : stats.warn ? ' warn' : '');
    };
    const add = (type, args) => {
      stats.all++;
      if (type === 'error') stats.error++;
      if (type === 'warn') stats.warn++;
      badge();
      const line = h('div', { class: 'cl ' + type }, h('span', { class: 'cic', text: { error: '✕', warn: '!', info: 'i', result: '←', input: '›', debug: '·' }[type] || '' }),
        h('span', { class: 'ctx', text: (args || []).join(' ') }));
      log.appendChild(line);
      if (log.children.length > 1000) log.firstChild.remove();
      log.scrollTop = log.scrollHeight;
      if (type === 'error' && kind === 'html') con.classList.add('open');
    };
    const onMsg = e => {
      if (e.source !== frame.contentWindow || !e.data || !e.data.__kod) return;
      if (e.data.type === 'clear') { log.innerHTML = ''; return; }
      add(e.data.type, e.data.args);
    };
    window.addEventListener('message', onMsg);
    const load = () => {
      log.innerHTML = '';
      stats = { error: 0, warn: 0, all: 0 };
      badge();
      if (tab && kind !== 'repl') {
        const f = Tools.previewFiles(tab);
        if (kind === 'js') f.files[key] = files[key];
        Native.previewSet(f);
        files = f.files;
      }
      if (Native.real) frame.src = PREVIEW_ORIGIN + '/' + key.split('/').map(encodeURIComponent).join('/') + '?_=' + Date.now();
      else frame.srcdoc = Tools.mockPage(files, key);
    };
    const p = UI.page({
      title, body, cls: 'previewpage',
      actions: [
        { icon: 'refresh', label: 'Оновити', run: () => load() },
      ],
      onclose: () => { window.removeEventListener('message', onMsg); frame.src = 'about:blank'; },
    });
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      const code = input.value;
      add('input', [code]);
      stats.all--;
      badge();
      frame.contentWindow.postMessage({ __kodEval: 1, code }, '*');
      Tools.replHistory.unshift(code);
      Tools.replPos = -1;
      input.value = '';
    });
    input.addEventListener('keyup', e => {
      if (e.key === 'ArrowUp' && Tools.replHistory.length) { Tools.replPos = Math.min(Tools.replPos + 1, Tools.replHistory.length - 1); input.value = Tools.replHistory[Tools.replPos]; }
      if (e.key === 'ArrowDown') { Tools.replPos = Math.max(Tools.replPos - 1, -1); input.value = Tools.replPos >= 0 ? Tools.replHistory[Tools.replPos] : ''; }
    });
    load();
    if (kind === 'repl') setTimeout(() => input.focus(), 200);
    return p;
  },

  replHistory: [], replPos: -1,

  repl() {
    const files = { '__kod_console__.html': '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font:15px system-ui;color:#888;margin:16px">Порожня сторінка для експериментів. Змінна <code>document</code> — це вона.</body></html>' };
    Native.previewSet({ tree: null, files });
    Tools.preview(null, '__kod_console__.html', 'repl', files);
  },

  /** У браузері (без Android) — вбудовуємо CSS і скрипти прямо в сторінку. */
  mockPage(files, key) {
    let html = files[key] || '';
    const dir = key.includes('/') ? key.slice(0, key.lastIndexOf('/') + 1) : '';
    const get = src => files[dir + src] != null ? files[dir + src] : (window.makeMockFile ? window.makeMockFile(dir + src) : null);
    html = html.replace(/<link\b[^>]*href=["']([^"']+\.css)["'][^>]*>/gi, (m, src) => { const c = get(src); return c != null ? '<style>' + c + '</style>' : m; });
    html = html.replace(/<script\b([^>]*)src=["']([^"']+)["']([^>]*)><\/script>/gi, (m, a, src, b) => { const c = get(decodeURI(src)); return c != null ? '<script' + a + b + '>' + c.replace(/<\/script/gi, '<\\/script') + '</script>' : m; });
    return '<script>' + Tools.hookSource + '</script>' + html;
  },

  hookSource: '',

  // ================================================================ Markdown

  async markdown(tab) {
    const src = tab.session.getValue();
    const html = await MD.render(src);
    const dark = Settings.isDark();
    const key = Tools.keyFor(tab);
    const dir = key.includes('/') ? key.slice(0, key.lastIndexOf('/') + 1) : '';
    const { tree, files } = Tools.previewFiles(tab);
    Native.previewSet({ tree, files });
    const doc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      (Native.real ? '<base href="' + PREVIEW_ORIGIN + '/' + dir.split('/').map(encodeURIComponent).join('/') + '" target="_blank">' : '<base target="_blank">') +
      '<style>' + MD.css(dark) + '</style></head><body><article class="md">' + html + '</article></body></html>';
    const frame = h('iframe', { class: 'pframe', sandbox: 'allow-popups allow-popups-to-escape-sandbox' });
    frame.srcdoc = doc;
    UI.page({
      title: tab.name, body: h('div', { class: 'pv' }, frame), cls: 'previewpage',
      actions: [
        { icon: 'refresh', label: 'Оновити', run: async () => { frame.srcdoc = doc.replace(/<article class="md">[\s\S]*<\/article>/, '<article class="md">' + await MD.render(tab.session.getValue()) + '</article>'); } },
        { icon: 'printer', label: 'Друк', run: () => Native.print(doc.replace(/<base[^>]*>/, ''), tab.name) },
      ],
    });
  },

  // ================================================================ порівняння

  async compare(tab) {
    tab = tab || K.cur;
    const opts = [];
    if (tab.uri) opts.push({ value: '$disk', icon: 'save', label: 'Збережена версія на диску', sub: 'Що змінилося з останнього збереження' });
    opts.push({ value: '$clip', icon: 'paste', label: 'Вміст буфера обміну' });
    const others = K.tabs.filter(t => t !== tab);
    if (others.length) opts.push({ header: 'Відкриті вкладки' });
    for (const t of others) opts.push({ value: t.id, label: t.name, sub: t.place && t.place !== t.name ? t.place : null, icon: 'file' });
    const v = await UI.choose('Порівняти «' + tab.name + '» з…', opts);
    if (!v) return;
    let a, nameA;
    if (v === '$disk') {
      const r = Native.read(tab.uri, tab.enc);
      if (!r.ok) { UI.toast('Не вдалося прочитати файл', { error: true }); return; }
      a = r.text; nameA = 'на диску';
    } else if (v === '$clip') {
      a = Native.clipGet(); nameA = 'буфер обміну';
    } else {
      const t = K.tabs.find(x => x.id === v);
      if (!t.loaded && !Tabs.load(t)) return;
      a = t.session.getValue(); nameA = t.name;
    }
    Tools.diff(a, tab.session.getValue(), nameA, tab.name, tab.mode);
  },

  async diff(a, b, nameA, nameB, mode) {
    if (a === b) { UI.toast('Вміст однаковий'); return; }
    const m = await loadModule('ace/ext/diff');
    const box = h('div', { class: 'diffbox' });
    const info = h('div', { class: 'diffinfo' });
    let inline = window.innerWidth < 720;
    let dv = null;
    const build = () => {
      if (dv) { dv.detach(); }
      box.innerHTML = '';
      box.classList.toggle('split', !inline);
      dv = m.createDiffView({ valueA: a, valueB: b, inline: inline ? 'b' : false }, {});
      const eds = inline ? [dv.editorB] : [dv.editorA, dv.editorB];
      for (const ed of eds) {
        box.appendChild(ed.container);
        ed.container.classList.add('diffed');
      }
      for (const ed of [dv.editorA, dv.editorB]) {
        if (!ed) continue;
        ed.setOptions({ theme: Settings.editorTheme(), fontSize: Math.max(10, K.set.fontSize - 1), fontFamily: K.ed.getOption('fontFamily'), readOnly: true, showPrintMargin: false, wrap: false });
        ed.session.setMode('ace/mode/' + (mode || 'text'));
      }
      setTimeout(() => {
        for (const ed of eds) ed.resize(true);
        dv.onInput && dv.onInput();
        const chunks = dv.chunks || [];
        let add = 0, del = 0;
        for (const c of chunks) { add += c.new.end.row - c.new.start.row; del += c.old.end.row - c.old.start.row; }
        info.innerHTML = '<span class="dA">' + esc(nameA) + '</span> → <span class="dB">' + esc(nameB) + '</span> · <b class="plus">+' + add + '</b> <b class="minus">−' + del + '</b> · ' + chunks.length + ' ' + plural(chunks.length, 'зміна', 'зміни', 'змін');
      }, 60);
    };
    const p = UI.page({
      title: 'Порівняння', body: h('div', { class: 'diffwrap' }, info, box), cls: 'diffpage',
      actions: [
        { icon: 'up', label: 'Попередня зміна', run: () => dv && dv.gotoNext(-1) },
        { icon: 'down', label: 'Наступна зміна', run: () => dv && dv.gotoNext(1) },
        { icon: 'columns', label: 'Поруч / разом', run: () => { inline = !inline; build(); } },
      ],
      onclose: () => { if (dv) { const eds = [dv.editorA, dv.editorB]; dv.detach(); eds.forEach(e => e && e.destroy()); } },
    });
    requestAnimationFrame(build);
    return p;
  },

  // ================================================================ форматування і JSON

  async format() {
    const t = K.cur;
    if (t.mode === 'json') return Tools.json('pretty');
    if (Fmt.supports(t.mode)) {
      const s = t.session;
      const before = s.getValue();
      let after, onlyIndent = false;
      try { after = Fmt.code(s); } catch (e) { after = null; }
      if (after != null && !before.endsWith('\n')) after = after.replace(/\n$/, '');
      if (after == null || !Fmt.safe(s, before, after)) {
        // складна конструкція (наприклад, JSX) — змінюємо лише відступи
        after = Fmt.reindent(s);
        onlyIndent = true;
      }
      if (after === before) { UI.toast('Уже відформатовано'); return; }
      const c = K.ed.getCursorPosition(), top = s.getScrollTop();
      s.doc.setValue(after);
      K.ed.moveCursorTo(Math.min(c.row, s.getLength() - 1), 0);
      s.setScrollTop(top);
      UI.toast(onlyIndent ? 'Вирівняно відступи (решту залишено як є)' : 'Відформатовано — «Скасувати» поверне як було');
      return;
    }
    if (!['html', 'css', 'php', 'xml', 'svg', 'scss', 'less'].includes(t.mode)) {
      UI.toast('Форматування є для HTML, CSS, JavaScript, TypeScript, Java, C/C++, C#, Kotlin, Go, Rust, PHP, XML і JSON');
      return;
    }
    const m = await loadModule('ace/ext/beautify');
    const s = t.session;
    const before = s.getValue();
    m.formatOptions = Object.assign(m.formatOptions || {}, { lineBreaksAfterCommasInCurlyBlock: true });
    const top = s.getScrollTop();
    m.beautify(s);
    s.setScrollTop(top);
    UI.toast(before === s.getValue() ? 'Уже відформатовано' : 'Відформатовано — «Скасувати» поверне як було');
  },

  json(mode) {
    const t = K.cur, s = t.session;
    const hasSel = !K.ed.selection.isEmpty();
    const src = hasSel ? K.ed.getSelectedText() : s.getValue();
    let data;
    try {
      data = JSON.parse(src);
    } catch (e) {
      let msg = e.message, row = null, col = 0;
      const pm = /position (\d+)/.exec(msg);
      const lm = /line (\d+) column (\d+)/.exec(msg);
      if (lm) { row = +lm[1] - 1; col = +lm[2] - 1; }
      else if (pm) { const before = src.slice(0, +pm[1]); row = before.split('\n').length - 1; col = before.length - before.lastIndexOf('\n') - 1; }
      if (row != null && !hasSel) Edit.gotoLine(row, col);
      msg = msg.replace(/^JSON\.parse: |^Unexpected/, m => m === 'Unexpected' ? 'Неочікуваний' : '').replace(/ in JSON at position \d+.*$/, '');
      UI.toast('JSON з помилкою' + (row != null ? ' у рядку ' + (row + 1) : '') + ': ' + msg, { error: true, ms: 5000 });
      return;
    }
    if (mode === 'check') { UI.toast('JSON правильний ✓'); return; }
    if (mode === 'sort') {
      const sortKeys = v => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.keys(v).sort((x, y) => x.localeCompare(y)).reduce((o, k) => (o[k] = sortKeys(v[k]), o), {}) : v;
      data = sortKeys(data);
    }
    const indent = s.getUseSoftTabs() ? ' '.repeat(s.getTabSize()) : '\t';
    const out = mode === 'min' ? JSON.stringify(data) : JSON.stringify(data, null, indent);
    if (hasSel) K.ed.session.replace(K.ed.getSelectionRange(), out);
    else if (out !== src.replace(/\n$/, '')) s.doc.setValue(out + (src.endsWith('\n') ? '\n' : ''));
  },

  // ================================================================ перетворення

  TRANSLIT: { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', '’': '', "'": '', ы: 'y', э: 'e', ё: 'io', ъ: '' },
  TRANSLIT_START: { є: 'ye', ї: 'yi', й: 'y', ю: 'yu', я: 'ya' },

  translit(s) {
    return s.replace(/зг/gi, m => m[0] === 'З' ? 'Zgh' : m[0] === 'з' && m[1] === 'Г' ? 'zGH' : 'zgh').replace(/[а-яіїєґ’'ыэёъ]/gi, (ch, i, str) => {
      const lower = ch.toLowerCase();
      const start = i === 0 || !/[а-яіїєґ’'a-z]/i.test(str[i - 1]);
      let out = (start && Tools.TRANSLIT_START[lower]) || Tools.TRANSLIT[lower];
      if (out == null) return ch;
      if (ch !== lower && out) out = out[0].toUpperCase() + out.slice(1);
      return out;
    });
  },

  convert(kind) {
    const f = {
      b64enc: s => btoa(Array.from(new TextEncoder().encode(s), b => String.fromCharCode(b)).join('')),
      b64dec: s => new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(s.replace(/\s+/g, '')), c => c.charCodeAt(0))),
      urlenc: s => encodeURIComponent(s),
      urldec: s => decodeURIComponent(s.replace(/\+/g, ' ')),
      htmlenc: s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
      htmldec: s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; },
      strenc: s => JSON.stringify(s).slice(1, -1),
      strdec: s => JSON.parse('"' + s.replace(/(^|[^\\])"/g, '$1\\"') + '"'),
      translit: s => Tools.translit(s),
    }[kind];
    Edit.mapText(src => {
      try { return f(src); } catch (e) { throw new Error('Не вдалося перетворити: це не схоже на ' + ({ b64dec: 'Base64', urldec: 'URL-кодування', strdec: 'екранований рядок' }[kind] || 'правильні дані')); }
    }, true);
  },

  async hash(algo) {
    const sel = K.ed.getSelectedText();
    const text = sel || K.ed.getValue();
    let v = Native.hash(text, algo);
    if (!Native.real && algo !== 'MD5' && window.crypto && crypto.subtle) {
      const d = await crypto.subtle.digest(algo, new TextEncoder().encode(text));
      v = Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
    }
    const r = await UI.dialog({
      title: algo + (sel ? ' виділеного' : ' файлу'),
      html: '<div class="hashv">' + esc(v) + '</div><p class="dnote">Від тексту в UTF-8' + (sel ? '' : ', як у редакторі (кінці рядків LF)') + '.</p>',
      buttons: [{ label: 'Закрити', value: null }, { label: 'Вставити', value: 'ins' }, { label: 'Копіювати', value: 'copy', primary: true }],
    });
    if (r === 'copy') { Native.clipSet(v); UI.toast('Скопійовано'); }
    if (r === 'ins') { K.ed.clearSelection(); K.ed.insert(v); }
  },

  async hardWrap() {
    const m = await loadModule('ace/ext/hardwrap');
    const r = Edit.lineRange();
    m.hardWrap(K.ed, { column: K.set.marginCol, startRow: r.first, endRow: r.last, allowMerge: true });
  },

  selectAllOccurrences() {
    const s = K.cur.session;
    let text = K.ed.getSelectedText(), word = false;
    if (!text) {
      const c = K.ed.getCursorPosition();
      text = s.getTextRange(s.getWordRange(c.row, c.column));
      word = true;
    }
    if (!text.trim() || text.includes('\n')) { UI.toast('Поставте курсор на слово'); return; }
    const n = K.ed.findAll(text, { caseSensitive: true, wholeWord: word, regExp: false });
    UI.toast('Курсорів: ' + n);
  },

  // ================================================================ список функцій і помилки

  outline() {
    const t = K.cur;
    const items = Langs.outline(t.mode, t.session.getValue(), t.session.getTabSize());
    if (!items.length) {
      UI.toast(['text'].includes(t.mode) ? 'Для звичайного тексту списку функцій немає' : 'Функцій, класів чи заголовків не знайдено');
      return;
    }
    const KIND = { fn: ['ƒ', 'функція'], method: ['m', 'метод'], class: ['C', 'клас'], type: ['T', 'тип'], heading: ['#', ''], selector: ['{}', ''], key: ['•', ''], sql: ['⊞', ''], block: ['‹›', ''], id: ['#', ''] };
    const cur = K.ed.getCursorPosition().row;
    let near = 0;
    items.forEach((it, i) => { if (it.row <= cur) near = i; });
    const input = h('input', { class: 'field', type: 'search', placeholder: 'Фільтр (' + items.length + ')', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const list = h('div', { class: 'olist' });
    let s;
    items.forEach((it, i) => {
      const k = KIND[it.kind] || ['•', ''];
      list.appendChild(h('button', {
        class: 'oitem k-' + it.kind + (i === near ? ' near' : ''), 'data-k': it.name.toLowerCase(),
        style: { paddingLeft: (12 + it.depth * 16) + 'px' },
        onclick: () => { s.close(); Edit.gotoLine(it.row, 0); },
      }, h('span', { class: 'okind', text: k[0] }), h('span', { class: 'oname', text: it.name }), h('span', { class: 'orow', text: it.row + 1 })));
    });
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      for (const b of list.children) b.hidden = q && !b.dataset.k.includes(q);
    });
    s = UI.sheet({ title: 'Список функцій · ' + t.name, body: h('div', null, input, list), full: true });
    setTimeout(() => { const n = list.querySelector('.near'); if (n) n.scrollIntoView({ block: 'center' }); }, 60);
  },

  problems() {
    const ann = K.cur.session.getAnnotations().slice().sort((a, b) => a.row - b.row || (a.column || 0) - (b.column || 0));
    if (!ann.length) { UI.toast(K.set.lint ? 'Помилок не знайдено' : 'Перевірку помилок вимкнено в налаштуваннях'); return; }
    UI.choose('Помилки й попередження (' + ann.length + ')', ann.map((a, i) => ({
      value: i, glyph: String(a.row + 1), label: a.text, sub: a.type === 'error' ? 'помилка' : a.type === 'warning' ? 'попередження' : 'примітка',
      icon: a.type === 'error' || a.type === 'warning' ? 'alert' : 'info',
    }))).then(i => { if (i != null) Edit.gotoLine(ann[i].row, ann[i].column || 0); });
  },

  async pickTheme() {
    const dark = Settings.isDark();
    const key = dark ? 'themeDark' : 'themeLight';
    const prev = K.set[key];
    const v = await UI.choose('Тема коду (' + (dark ? 'темна' : 'світла') + ')', THEMES.filter(t => t[2] === dark).map(t => ({ value: t[0], label: t[1], checked: t[0] === prev })));
    if (v) Settings.set(key, v);
  },

  // ================================================================ друк

  async print() {
    const t = K.cur;
    const hl = await loadModule('ace/ext/static_highlight');
    const mode = await new Promise(res => ace.config.loadModule('ace/mode/' + t.mode, m => res(m && m.Mode ? new m.Mode() : null)));
    const theme = await loadModule('ace/theme/kod_light');
    const r = hl.renderSync(t.session.getValue(), mode || new (ace.require('ace/mode/text').Mode)(), theme, 1, false);
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(t.name) + '</title><style>' +
      '@font-face{font-family:"JetBrains Mono";src:url(fonts/JetBrainsMono-Regular.woff2) format("woff2")}' +
      '@page{margin:14mm 12mm}body{margin:0;font:10px/1.5 "JetBrains Mono",monospace;-webkit-print-color-adjust:exact}' +
      'h1{font:600 12px system-ui,sans-serif;margin:0 0 8px;color:#555}' + r.css +
      '.ace_static_highlight{font-family:"JetBrains Mono",monospace!important;font-size:10px!important;white-space:pre-wrap}' +
      '.ace_static_highlight .ace_gutter{color:#aaa}</style></head><body><h1>' + esc(t.place || t.name) + '</h1>' + r.html + '</body></html>';
    Native.print(html, t.name);
  },
};

// ==================================================================== Markdown → HTML

const MD = {
  LANG: { js: 'javascript', javascript: 'javascript', ts: 'typescript', typescript: 'typescript', py: 'python', python: 'python', sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', html: 'html', xml: 'xml', css: 'css', scss: 'scss', json: 'json', yml: 'yaml', yaml: 'yaml', md: 'markdown', markdown: 'markdown', c: 'c_cpp', cpp: 'c_cpp', 'c++': 'c_cpp', h: 'c_cpp', cs: 'csharp', csharp: 'csharp', java: 'java', kt: 'kotlin', kotlin: 'kotlin', rb: 'ruby', ruby: 'ruby', go: 'golang', rs: 'rust', rust: 'rust', sql: 'sql', php: 'php', lua: 'lua', diff: 'diff', dockerfile: 'dockerfile', ini: 'ini', toml: 'toml', swift: 'swift', dart: 'dart' },

  inline(s) {
    const codes = [];
    s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (m, f, c) => { codes.push('<code>' + esc(c.trim()) + '</code>'); return '\u0000' + (codes.length - 1) + '\u0000'; });
    s = s.replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, (m, c) => '\u0001' + c.charCodeAt(0) + '\u0001');
    // HTML-теги лишаємо, решту екрануємо
    s = s.replace(/<(\/?[a-zA-Z][\w-]*(?:\s[^<>]*)?\/?)>|([<>&])/g, (m, tag, ch, off, str) => tag ? m : ch === '&' ? (/^&(#\d+|#x[\da-f]+|\w+);/i.test(str.slice(off)) ? '&' : '&amp;') : ch === '<' ? '&lt;' : '&gt;');
    s = s.replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g, (m, alt, src, title) => '<img src="' + esc(src) + '" alt="' + esc(alt) + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>');
    s = s.replace(/\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g, (m, t, href, title) => '<a href="' + esc(href) + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + t + '</a>');
    s = s.replace(/<(https?:\/\/[^>\s]+)>/g, '<a href="$1">$1</a>');
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?'"])/g, '$1<a href="$2">$2</a>');
    s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>');
    s = s.replace(/(^|[^\w*])\*(?=\S)([\s\S]*?\S)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w_])_(?=\S)([\s\S]*?\S)_(?![\w_])/g, '$1<em>$2</em>');
    s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
    s = s.replace(/(?: {2,}|\\)\n/g, '<br>\n');
    s = s.replace(/\u0001(\d+)\u0001/g, (m, c) => esc(String.fromCharCode(+c)));
    s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => codes[+i]);
    return s;
  },

  async render(src) {
    const lines = src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    const out = [];
    const codeBlocks = [];
    let i = 0;
    const isBlank = l => !l || !l.trim();
    const blockStart = l => /^ {0,3}(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|```|~~~|(?:[-*_]\s*){3,}$|<\/?(div|p|table|pre|ul|ol|h\d|blockquote|section|details|summary|img|hr|br)\b)/i.test(l);

    const parseList = (start) => {
      const ordered = /^\s*\d+[.)]\s/.test(lines[start]);
      const baseIndent = lines[start].match(/^\s*/)[0].length;
      const items = [];
      let j = start;
      while (j < lines.length) {
        const l = lines[j];
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l);
        if (m && m[1].length === baseIndent && (/\d/.test(m[2]) === ordered)) {
          items.push({ text: [m[3]], sub: [], num: parseInt(m[2], 10) });
          j++;
          continue;
        }
        if (isBlank(l)) {
          if (j + 1 < lines.length && /^\s+\S/.test(lines[j + 1]) && lines[j + 1].match(/^\s*/)[0].length > baseIndent) { j++; continue; }
          break;
        }
        const ind = l.match(/^\s*/)[0].length;
        if (ind > baseIndent && items.length) { items[items.length - 1].sub.push(l.slice(Math.min(ind, baseIndent + 2))); j++; continue; }
        if (!blockStart(l) && items.length) { items[items.length - 1].text.push(l.trim()); j++; continue; }
        break;
      }
      return { ordered, items, end: j, start: items.length ? items[0].num : 1 };
    };

    const renderBlocks = async (ls) => {
      const save = { lines: lines.splice(0, lines.length, ...ls), i };
      i = 0;
      const html = await walk();
      lines.splice(0, lines.length, ...save.lines);
      i = save.i;
      return html;
    };

    const walk = async () => {
      const res = [];
      while (i < lines.length) {
        const l = lines[i];
        if (isBlank(l)) { i++; continue; }
        let m;
        if ((m = /^ {0,3}(```+|~~~+)\s*([\w+#.-]*)/.exec(l))) {
          const fence = m[1], lang = m[2].toLowerCase();
          const body = [];
          i++;
          while (i < lines.length && !lines[i].trim().startsWith(fence)) body.push(lines[i++]);
          i++;
          codeBlocks.push({ lang, code: body.join('\n') });
          res.push('\u0002' + (codeBlocks.length - 1) + '\u0002');
          continue;
        }
        if ((m = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l))) {
          const lvl = m[1].length, text = m[2];
          const id = text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
          res.push('<h' + lvl + ' id="' + esc(id) + '">' + MD.inline(text) + '</h' + lvl + '>');
          i++;
          continue;
        }
        if (/^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(l)) { res.push('<hr>'); i++; continue; }
        if (/^ {0,3}>/.test(l)) {
          const q = [];
          while (i < lines.length && !isBlank(lines[i]) && (/^ {0,3}>/.test(lines[i]) || q.length)) {
            if (!/^ {0,3}>/.test(lines[i]) && blockStart(lines[i])) break;
            q.push(lines[i].replace(/^ {0,3}> ?/, ''));
            i++;
          }
          res.push('<blockquote>' + await renderBlocks(q) + '</blockquote>');
          continue;
        }
        if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
          const list = parseList(i);
          i = list.end;
          const tag = list.ordered ? 'ol' : 'ul';
          let html = '<' + tag + (list.ordered && list.start !== 1 ? ' start="' + list.start + '"' : '') + '>';
          for (const it of list.items) {
            let text = it.text.join('\n');
            let cls = '';
            const task = /^\[([ xX])\]\s+/.exec(text);
            if (task) { cls = ' class="task"'; text = '<input type="checkbox" disabled' + (task[1] !== ' ' ? ' checked' : '') + '> ' + text.slice(task[0].length); }
            html += '<li' + cls + '>' + (task ? text.replace(/^(<input[^>]+>) ([\s\S]*)$/, (mm, a, b) => a + ' ' + MD.inline(b)) : MD.inline(text)) + (it.sub.length ? await renderBlocks(it.sub) : '') + '</li>';
          }
          res.push(html + '</' + tag + '>');
          continue;
        }
        if (/\|/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
          const split = r => r.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim());
          const head = split(l);
          const align = split(lines[i + 1]).map(c => c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : '');
          i += 2;
          let html = '<div class="tbl"><table><thead><tr>' + head.map((c, k) => '<th' + (align[k] ? ' style="text-align:' + align[k] + '"' : '') + '>' + MD.inline(c) + '</th>').join('') + '</tr></thead><tbody>';
          while (i < lines.length && /\|/.test(lines[i]) && !isBlank(lines[i])) {
            const cells = split(lines[i++]);
            html += '<tr>' + head.map((x, k) => '<td' + (align[k] ? ' style="text-align:' + align[k] + '"' : '') + '>' + MD.inline(cells[k] || '') + '</td>').join('') + '</tr>';
          }
          res.push(html + '</tbody></table></div>');
          continue;
        }
        if (/^ {0,3}<(\w+)[^>]*>/.test(l) && /^ {0,3}<\/?(div|table|pre|details|section|p|ul|ol|h\d|blockquote|figure|picture|video|audio|iframe|center|img|br|hr|svg)\b/i.test(l)) {
          const blk = [];
          while (i < lines.length && !isBlank(lines[i])) blk.push(lines[i++]);
          res.push(blk.join('\n'));
          continue;
        }
        if (/^ {4}/.test(l)) {
          const body = [];
          while (i < lines.length && (/^ {4}/.test(lines[i]) || (isBlank(lines[i]) && i + 1 < lines.length && /^ {4}/.test(lines[i + 1])))) body.push(lines[i++].slice(4));
          codeBlocks.push({ lang: '', code: body.join('\n') });
          res.push('\u0002' + (codeBlocks.length - 1) + '\u0002');
          continue;
        }
        const para = [];
        while (i < lines.length && !isBlank(lines[i]) && !(para.length && blockStart(lines[i]))) {
          if (para.length && /^ {0,3}(=+|-+)\s*$/.test(lines[i])) {
            const lvl = lines[i].trim()[0] === '=' ? 1 : 2;
            res.push('<h' + lvl + '>' + MD.inline(para.join('\n')) + '</h' + lvl + '>');
            para.length = 0;
            i++;
            break;
          }
          para.push(lines[i++]);
        }
        if (para.length) res.push('<p>' + MD.inline(para.join('\n')) + '</p>');
      }
      return res.join('\n');
    };

    let html = await walk();
    // підсвітка блоків коду
    const hl = codeBlocks.some(b => MD.LANG[b.lang]) ? await loadModule('ace/ext/static_highlight') : null;
    const theme = hl ? await loadModule('ace/theme/' + (Settings.isDark() ? 'kod_dark' : 'kod_light')) : null;
    let css = '';
    for (let k = 0; k < codeBlocks.length; k++) {
      const b = codeBlocks[k];
      let body = '<pre><code>' + esc(b.code) + '</code></pre>';
      const mode = MD.LANG[b.lang];
      if (hl && mode) {
        try {
          const M = await new Promise(res => ace.config.loadModule('ace/mode/' + mode, m => res(m)));
          const r = hl.renderSync(b.code, new M.Mode(), theme, 1, true);
          if (!css) css = r.css;
          body = '<div class="code">' + r.html + '</div>';
        } catch (e) { /* лишаємо без підсвітки */ }
      }
      html = html.replace('\u0002' + k + '\u0002', body);
    }
    return (css ? '<style>' + css + '</style>' : '') + html;
  },

  css(dark) {
    const c = dark
      ? { bg: '#15171c', fg: '#d5dae6', muted: '#8b93a6', line: '#2a2e38', code: '#1d2027', link: '#8aa4ff', quote: '#3b4257' }
      : { bg: '#ffffff', fg: '#1f2430', muted: '#6b7280', line: '#e5e7eb', code: '#f4f6fa', link: '#3b5bdb', quote: '#d6dbe6' };
    return 'html{background:' + c.bg + ';color:' + c.fg + '}body{margin:0;padding:20px 18px 60px;font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;word-wrap:break-word}' +
      '.md{max-width:760px;margin:0 auto}h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.6em 0 .6em;font-weight:650}h1{font-size:1.8em;border-bottom:1px solid ' + c.line + ';padding-bottom:.3em;margin-top:.4em}' +
      'h2{font-size:1.4em;border-bottom:1px solid ' + c.line + ';padding-bottom:.25em}h3{font-size:1.15em}p,ul,ol,blockquote,table,pre,.code{margin:0 0 1em}a{color:' + c.link + ';text-decoration:none}a:hover{text-decoration:underline}' +
      'code{font:.88em "JetBrains Mono",ui-monospace,monospace;background:' + c.code + ';padding:.15em .35em;border-radius:5px}pre,.code{background:' + c.code + ';border-radius:10px;padding:12px 14px;overflow:auto}' +
      'pre code{background:none;padding:0;font-size:.85em}.code .ace_static_highlight{background:transparent!important;font:13px/1.55 "JetBrains Mono",ui-monospace,monospace!important;border:0}' +
      'blockquote{margin-left:0;padding:.1em 1em;border-left:4px solid ' + c.quote + ';color:' + c.muted + '}img{max-width:100%;border-radius:6px}hr{border:0;border-top:1px solid ' + c.line + ';margin:2em 0}' +
      '.tbl{overflow-x:auto}table{border-collapse:collapse;min-width:50%}th,td{border:1px solid ' + c.line + ';padding:6px 12px}th{background:' + c.code + ';text-align:left}' +
      'li{margin:.25em 0}li.task{list-style:none;margin-left:-1.3em}li.task input{margin-right:.4em}del{opacity:.6}';
  },
};
