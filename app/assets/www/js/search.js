'use strict';
/* Пошук і заміна: панель у файлі, «Перейти до рядка», «Знайти в папці» і у відкритих вкладках. */

const AceSearch = ace.require('ace/search').Search;
const Range = ace.require('ace/range').Range;

const Search = {
  opts: { cs: false, word: false, regex: false, inSel: false },
  history: { find: [], rep: [] },
  range: null, rangeMarker: null,
  isOpen: false, replaceOn: false,

  load() {
    const s = Native.kvGet('search', null);
    if (s) {
      Object.assign(Search.opts, s.opts || {}, { inSel: false });
      Search.history = Object.assign({ find: [], rep: [] }, s.history || {});
    }
  },
  saveState: debounce(() => Native.kvPut('search', { opts: Search.opts, history: Search.history }), 500),

  remember(kind, v) {
    if (!v) return;
    const list = Search.history[kind].filter(x => x !== v);
    list.unshift(v);
    Search.history[kind] = list.slice(0, 20);
    Search.saveState();
    Search.fillHistory();
  },

  fillHistory() {
    for (const kind of ['find', 'rep']) {
      const dl = $('#dl-' + kind);
      if (!dl) continue;
      dl.innerHTML = '';
      for (const v of Search.history[kind]) dl.appendChild(h('option', { value: v }));
    }
  },

  // ---------------------------------------------------------------- панель

  build() {
    const bar = $('#findbar');
    bar.innerHTML = '';
    const chip = (key, label, title) => h('button', {
      class: 'chip' + (Search.opts[key] ? ' on' : ''), 'data-k': key, title, html: label,
      onclick: e => {
        Search.opts[key] = !Search.opts[key];
        e.currentTarget.classList.toggle('on', Search.opts[key]);
        if (key === 'inSel') Search.setRange(Search.opts.inSel);
        Search.saveState();
        Search.live(false);
      },
    });
    bar.appendChild(h('div', { class: 'frow' },
      h('div', { class: 'fin' },
        h('input', { id: 'fq', type: 'search', placeholder: 'Знайти', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search', list: 'dl-find' }),
        h('span', { class: 'fcount', id: 'fcount' })),
      h('button', { class: 'ib', html: ic('up'), title: 'Попереднє (Shift+F3)', onclick: () => Search.next(true) }),
      h('button', { class: 'ib', html: ic('down'), title: 'Наступне (F3)', onclick: () => Search.next(false) }),
      h('button', { class: 'ib' + (Search.replaceOn ? ' on' : ''), id: 'fswap', html: ic('replace'), title: 'Заміна', onclick: () => Search.toggleReplace() }),
      h('button', { class: 'ib', html: ic('x'), title: 'Закрити', onclick: () => Search.close() })));
    bar.appendChild(h('div', { class: 'frow frep', hidden: !Search.replaceOn },
      h('div', { class: 'fin' }, h('input', { id: 'fr', type: 'search', placeholder: 'Замінити на', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done', list: 'dl-rep' })),
      h('button', { class: 'btn sm', text: 'Замінити', onclick: () => Search.replace() }),
      h('button', { class: 'btn sm primary', text: 'Усі', onclick: () => Search.replaceAll() })));
    bar.appendChild(h('div', { class: 'frow fopts' },
      chip('cs', 'Aa', 'Враховувати регістр'),
      chip('word', '<u>ab</u>', 'Ціле слово'),
      chip('regex', '.*', 'Регулярний вираз'),
      chip('inSel', 'У виділенні', 'Шукати лише у виділеному'),
      h('button', { class: 'chip', html: ic('cursors') + 'Виділити всі', onclick: () => Search.selectAll() }),
      h('button', { class: 'chip', html: ic('bookmark') + 'Закласти', onclick: () => Search.bookmarkAll() }),
      h('button', { class: 'chip', html: ic('folder') + 'У папці', onclick: () => Search.inFiles(null, $('#fq').value) })));
    bar.appendChild(h('datalist', { id: 'dl-find' }));
    bar.appendChild(h('datalist', { id: 'dl-rep' }));
    Search.fillHistory();
    const q = $('#fq'), r = $('#fr');
    q.addEventListener('input', () => Search.live(true));
    q.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); Search.next(e.shiftKey); Search.remember('find', q.value); }
      else if (e.key === 'Escape') { e.preventDefault(); Search.close(); }
      else if (e.key === 'F3') { e.preventDefault(); Search.next(e.shiftKey); }
    });
    r.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); Search.replace(); }
      else if (e.key === 'Escape') { e.preventDefault(); Search.close(); }
    });
  },

  open(replace) {
    if (!$('#fq')) Search.build();
    Search.isOpen = true;
    if (replace != null) Search.setReplace(replace);
    $('#findbar').hidden = false;
    document.body.classList.add('finding');
    const q = $('#fq');
    const sel = K.ed.getSelectedText();
    const multiLine = sel.includes('\n');
    if (sel && !multiLine && sel.length < 200) q.value = Search.opts.regex ? sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : sel;
    if (multiLine && !Search.opts.inSel) {
      Search.opts.inSel = true;
      const c = $('#findbar .chip[data-k="inSel"]');
      if (c) c.classList.add('on');
      Search.setRange(true);
    }
    setTimeout(() => { q.focus(); q.select(); }, 30);
    Search.live(false);
    setTimeout(() => K.ed.resize(), 0);
  },

  close() {
    if (!Search.isOpen) return;
    Search.isOpen = false;
    $('#findbar').hidden = true;
    document.body.classList.remove('finding');
    Search.setRange(false);
    Search.opts.inSel = false;
    if (K.cur) K.cur.session.highlight(null);
    K.ed.renderer.updateBackMarkers();
    K.ed.resize();
    K.ed.focus();
  },

  toggleReplace() { Search.setReplace(!Search.replaceOn); },

  setReplace(on) {
    Search.replaceOn = on;
    if (!$('#fq')) return;
    $('#findbar .frep').hidden = !on;
    $('#fswap').classList.toggle('on', on);
    setTimeout(() => K.ed.resize(), 0);
    if (on) setTimeout(() => (($('#fq').value ? $('#fr') : $('#fq'))).focus(), 30);
  },

  setRange(on) {
    const s = K.cur && K.cur.session;
    if (Search.rangeMarker != null && Search.rangeSession) Search.rangeSession.removeMarker(Search.rangeMarker);
    Search.rangeMarker = null;
    Search.range = null;
    if (!on || !s) return;
    let r = K.ed.getSelectionRange();
    if (r.isEmpty()) r = new Range(0, 0, s.getLength(), 0);
    if (r.end.column === 0 && r.end.row > r.start.row) r.end = { row: r.end.row - 1, column: s.getLine(r.end.row - 1).length };
    const range = Range.fromPoints(r.start, r.end);
    range.start = s.doc.createAnchor(range.start.row, range.start.column);
    range.end = s.doc.createAnchor(range.end.row, range.end.column);
    Search.range = range;
    Search.rangeSession = s;
    Search.rangeMarker = s.addMarker(range, 'kod-find-range', 'text');
    K.ed.clearSelection();
  },

  /** Параметри для пошуку Ace. */
  aceOpts(extra) {
    const o = Search.opts;
    return Object.assign({
      needle: $('#fq') ? $('#fq').value : '',
      caseSensitive: o.cs, wholeWord: o.word, regExp: o.regex, wrap: true,
      range: o.inSel && Search.range ? Search.range : null,
    }, extra || {});
  },

  valid(needle) {
    if (!Search.opts.regex) return true;
    try { new RegExp(needle); return true; } catch (e) { return false; }
  },

  /** Пошук під час набору: підсвітити всі збіги і стати на найближчий. */
  live(move) {
    if (!Search.isOpen || !K.cur) return;
    const needle = $('#fq').value;
    const fin = $('#fq').parentNode;
    fin.classList.remove('bad', 'none');
    const s = K.cur.session;
    if (!needle) { s.highlight(null); K.ed.renderer.updateBackMarkers(); $('#fcount').textContent = ''; return; }
    if (!Search.valid(needle)) { fin.classList.add('bad'); $('#fcount').textContent = 'помилка'; s.highlight(null); K.ed.renderer.updateBackMarkers(); return; }
    const opts = Search.aceOpts();
    if (move) {
      const start = Search.liveStart || K.ed.getSelectionRange().start;
      Search.liveStart = start;
      K.ed.find(needle, Object.assign({}, opts, { start, skipCurrent: false, preventScroll: false }));
    }
    K.ed.$search.set(opts);
    const re = K.ed.$search.$assembleRegExp(Object.assign({}, opts));
    s.highlight(re || null);
    if (s.$searchHighlight) s.$searchHighlight.clazz = 'kod-search-hl';
    K.ed.renderer.updateBackMarkers();
    Search.count();
  },

  count() {
    const needle = $('#fq').value;
    const s = K.cur.session;
    const srch = new AceSearch().set(Search.aceOpts({ needle }));
    let ranges = [];
    try { ranges = srch.findAll(s); } catch (e) { ranges = []; }
    const sel = K.ed.getSelectionRange();
    const i = ranges.findIndex(r => r.start.row === sel.start.row && r.start.column === sel.start.column && r.end.row === sel.end.row && r.end.column === sel.end.column);
    const el = $('#fcount');
    if (!ranges.length) { el.textContent = 'немає'; $('#fq').parentNode.classList.add('none'); return 0; }
    el.textContent = (i >= 0 ? (i + 1) + '/' : '') + fmtNum(ranges.length);
    return ranges.length;
  },

  next(back) {
    if (!K.cur) return;
    if (!Search.isOpen || !$('#fq').value) { Search.open(); return; }
    const needle = $('#fq').value;
    if (!Search.valid(needle)) return;
    Search.liveStart = null;
    K.ed.find(needle, Search.aceOpts({ backwards: !!back, skipCurrent: true }));
    Search.count();
  },

  replaceText() {
    let r = $('#fr').value;
    if (Search.opts.regex) r = r.replace(/\\(n|t|r|\\)/g, (m, c) => ({ n: '\n', t: '\t', r: '\r', '\\': '\\\\' }[c]));
    return r;
  },

  replace() {
    const needle = $('#fq').value;
    if (!needle || !Search.valid(needle) || K.ed.getReadOnly()) return;
    Search.remember('find', needle);
    Search.remember('rep', $('#fr').value);
    const n = K.ed.replace(Search.replaceText(), Search.aceOpts({ needle, skipCurrent: false }));
    if (!n) UI.toast('Збігів не знайдено');
    else K.ed.find(needle, Search.aceOpts({ skipCurrent: true }));
    Search.liveStart = null;
    Search.count();
  },

  replaceAll() {
    const needle = $('#fq').value;
    if (!needle || !Search.valid(needle) || K.ed.getReadOnly()) return;
    Search.remember('find', needle);
    Search.remember('rep', $('#fr').value);
    const n = K.ed.replaceAll(Search.replaceText(), Search.aceOpts({ needle })) || 0;
    UI.toast(n ? 'Замінено: ' + fmtNum(n) : 'Збігів не знайдено');
    Search.count();
  },

  selectAll() {
    const needle = $('#fq').value;
    if (!needle || !Search.valid(needle)) return;
    const n = K.ed.findAll(needle, Search.aceOpts());
    if (n) { UI.toast('Виділено: ' + n + ' — тепер можна редагувати всі одразу'); Search.close(); }
  },

  bookmarkAll() {
    const needle = $('#fq').value;
    if (!needle || !Search.valid(needle)) return;
    const ranges = new AceSearch().set(Search.aceOpts({ needle })).findAll(K.cur.session);
    for (const r of ranges) Edit.setBookmark(K.cur, r.start.row, true);
    UI.toast(ranges.length ? 'Закладки на рядках зі збігами: ' + new Set(ranges.map(r => r.start.row)).size : 'Збігів не знайдено');
  },

  onTab() {
    if (Search.isOpen) {
      Search.setRange(false);
      Search.opts.inSel = false;
      const c = $('#findbar .chip[data-k="inSel"]');
      if (c) c.classList.remove('on');
      Search.liveStart = null;
      Search.live(false);
    }
  },

  /** Знайти виділене слово без відкриття панелі (Ctrl+F3). */
  quick(back) {
    const sel = K.ed.getSelectedText() || K.cur.session.getTextRange(K.cur.session.getWordRange(K.ed.getCursorPosition().row, K.ed.getCursorPosition().column));
    if (!sel || sel.includes('\n')) return;
    K.ed.find(sel, { caseSensitive: true, wholeWord: false, regExp: false, wrap: true, backwards: !!back, skipCurrent: true });
  },

  // ---------------------------------------------------------------- перехід до рядка

  async gotoLine() {
    const s = K.cur.session;
    const c = K.ed.getCursorPosition();
    const v = await UI.prompt('Перейти до рядка', String(c.row + 1), {
      type: 'text', inputmode: 'numeric', note: 'Рядки 1–' + fmtNum(s.getLength()) + '. Можна «рядок:колонка», наприклад 120:8.', ok: 'Перейти',
    });
    if (v == null) return;
    const m = /^\s*(\d+)?\s*(?:[:,.]\s*(\d+))?\s*$/.exec(v);
    if (!m || (!m[1] && !m[2])) { UI.toast('Введіть номер рядка'); return; }
    const row = m[1] ? +m[1] - 1 : c.row;
    Edit.gotoLine(row, m[2] ? +m[2] - 1 : 0);
  },

  // ---------------------------------------------------------------- у папці і в усіх вкладках

  inFiles(scope, q) {
    const ws = K.ws;
    const st = Search.fif || (Search.fif = { q: '', rep: '', include: '', scope: 'ws' });
    if (q) st.q = q;
    if (scope) { st.dir = scope; st.scope = 'ws'; } else st.dir = null;
    if (!ws) st.scope = 'tabs';
    const body = h('div', { class: 'fif' });
    const p = UI.page({ title: 'Знайти у файлах', body, cls: 'fifpage', onclose: () => { if (job) Native.cancel(job); } });
    const field = (label, input) => h('label', { class: 'ffield' }, h('span', { text: label }), input);
    const qi = h('input', { class: 'field', type: 'search', value: st.q, placeholder: 'Текст або регулярний вираз', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', list: 'dl-find2', enterkeyhint: 'search' });
    const ri = h('input', { class: 'field', type: 'search', value: st.rep, placeholder: 'Порожньо — лише пошук', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const ii = h('input', { class: 'field', type: 'search', value: st.include, placeholder: 'усі файли, напр. *.js *.css', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const xi = h('input', { class: 'field', type: 'search', value: K.set.findExclude, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const dl = h('datalist', { id: 'dl-find2' }, Search.history.find.map(v => h('option', { value: v })));
    const opt = (key, label) => h('button', {
      class: 'chip' + (Search.opts[key] ? ' on' : ''), html: label,
      onclick: e => { Search.opts[key] = !Search.opts[key]; e.currentTarget.classList.toggle('on', Search.opts[key]); Search.saveState(); },
    });
    const scopes = h('div', { class: 'seg' });
    const setScope = v => {
      st.scope = v;
      for (const b of scopes.children) b.classList.toggle('on', b.dataset.v === v);
      wsOnly.hidden = v !== 'ws';
    };
    scopes.appendChild(h('button', { 'data-v': 'ws', disabled: !ws, text: ws ? (st.dir ? 'Папка ' + st.dir.path : 'Папка «' + ws.name + '»') : 'Папка не відкрита', onclick: () => setScope('ws') }));
    scopes.appendChild(h('button', { 'data-v': 'tabs', text: 'Відкриті вкладки', onclick: () => setScope('tabs') }));
    const wsOnly = h('div', null, field('Файли', ii), field('Пропускати папки', xi));
    const results = h('div', { class: 'fres' });
    let job = null, collected = [];
    const summary = h('div', { class: 'fsum' });
    const go = h('button', { class: 'btn primary', text: 'Знайти', onclick: () => run(false) });
    const repBtn = h('button', { class: 'btn', text: 'Замінити всі', onclick: () => run(true) });
    body.appendChild(h('div', { class: 'fform' },
      field('Знайти', qi), field('Замінити на', ri),
      h('div', { class: 'fopts2' }, opt('cs', 'Aa'), opt('word', '<u>ab</u>'), opt('regex', '.*')),
      scopes, wsOnly, h('div', { class: 'fbtns' }, repBtn, go), dl));
    body.appendChild(summary);
    body.appendChild(results);
    setScope(st.scope);
    if (!ws) body.querySelector('.fform').appendChild(h('button', { class: 'btn ghost', html: ic('folderOpen') + ' Відкрити папку проєкту', onclick: () => { p.close(); Workspace.pick(); } }));
    setTimeout(() => qi.focus(), 120);
    qi.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(false); } });


    const run = async replace => {
      const opts = { q: qi.value, rep: ri.value, regex: Search.opts.regex, cs: Search.opts.cs, word: Search.opts.word, include: ii.value, exclude: xi.value };
      st.q = qi.value; st.rep = ri.value; st.include = ii.value;
      if (xi.value !== K.set.findExclude) Settings.set('findExclude', xi.value);
      if (!opts.q) { qi.focus(); return; }
      if (opts.regex) { try { new RegExp(opts.q); } catch (e) { UI.toast('Помилка у виразі: ' + e.message, { error: true }); return; } }
      Search.remember('find', opts.q);
      qi.blur(); ri.blur();
      if (st.scope === 'tabs') return runTabs(opts, replace);
      if (replace) {
        if (!collected.length || collected.q !== opts.q) { UI.toast('Спершу натисніть «Знайти», щоб побачити, що буде замінено'); return; }
        const dirtyPaths = new Set(K.tabs.filter(t => t.dirty && t.tree === ws.tree).map(t => t.path));
        const paths = collected.map(f => f.path).filter(x => !dirtyPaths.has(x));
        const n = collected.reduce((a, f) => a + f.count, 0);
        const skipped = collected.length - paths.length;
        const ok = await UI.confirm('Замінити у файлах?',
          'Буде замінено ' + fmtNum(n) + ' ' + plural(n, 'збіг', 'збіги', 'збігів') + ' у ' + paths.length + ' ' + plural(paths.length, 'файлі', 'файлах', 'файлах') + ' на диску. Скасувати це не можна.' +
          (skipped ? ' Пропущено ' + skipped + ' з незбереженими змінами у вкладках.' : ''), 'Замінити', true);
        if (!ok) return;
        opts.paths = paths;
      }
      if (job) Native.cancel(job);
      results.innerHTML = '';
      summary.innerHTML = '';
      summary.appendChild(h('div', { class: 'spin' }));
      summary.appendChild(h('span', { text: replace ? 'Замінюю…' : 'Шукаю…' }));
      go.disabled = true;
      if (!replace) collected = [];
      collected.q = opts.q;
      const t0 = Date.now();
      job = Native.find(ws.tree, st.dir ? st.dir.id : '', st.dir ? st.dir.path : '', opts, replace, data => {
        if (data.error) { summary.textContent = 'Помилка: ' + data.error; go.disabled = false; return; }
        if (replace) {
          if (data.done) {
            go.disabled = false;
            summary.textContent = 'Замінено ' + fmtNum(data.replaced) + ' у ' + data.replacedFiles + ' ' + plural(data.replacedFiles, 'файлі', 'файлах', 'файлах') + (data.errors ? ', помилок: ' + data.errors : '');
            results.innerHTML = '';
            collected = [];
            for (const t of K.tabs) if (t.tree === ws.tree && t.loaded && !t.dirty && t.uri) Tabs.reload(t, null, false);
          }
          return;
        }
        for (const f of data.files || []) { collected.push(f); results.appendChild(Search.fileGroup(f, ws, st.dir, qi.value)); }
        if (data.done) {
          go.disabled = false;
          job = null;
          const files = collected.length, hits = collected.reduce((a, f) => a + f.count, 0);
          summary.textContent = files
            ? fmtNum(hits) + ' ' + plural(hits, 'збіг', 'збіги', 'збігів') + ' у ' + files + ' ' + plural(files, 'файлі', 'файлах', 'файлах') + ' · переглянуто ' + data.scanned + ' за ' + ((Date.now() - t0) / 1000).toFixed(1).replace('.', ',') + ' с' + (data.limit ? ' (показано перші 5000)' : '')
            : 'Нічого не знайдено · переглянуто ' + data.scanned + ' ' + plural(data.scanned, 'файл', 'файли', 'файлів');
        } else summary.lastChild.textContent = 'Шукаю… переглянуто ' + data.scanned;
      });
    };

    const runTabs = async (opts, replace) => {
      let src = opts.regex ? opts.q : opts.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (opts.word) src = '(?<![\\p{L}\\p{N}_])(?:' + src + ')(?![\\p{L}\\p{N}_])';
      const re = new RegExp(src, 'gu' + (opts.cs ? '' : 'i'));
      results.innerHTML = '';
      let hits = 0, files = 0, replaced = 0;
      for (const t of K.tabs) {
        if (!t.loaded && !Tabs.load(t)) continue;
        if (replace) {
          if (t.readOnly) continue;
          const text = t.session.getValue();
          let n = 0;
          const out = text.split('\n').map(ln => ln.replace(re, (...m) => { n++; return Search.expand(opts.rep, m); })).join('\n');
          if (n) { t.session.doc.setValue(out); replaced += n; files++; }
          continue;
        }
        const f = { path: t.name, count: 0, hits: [], tab: t };
        const lines = t.session.doc.getAllLines();
        lines.forEach((ln, i) => {
          if (ln.length > 5000) return;
          const ms = [...ln.matchAll(re)];
          if (!ms.length) return;
          f.count += ms.length;
          if (f.hits.length < 300) f.hits.push({ line: i, col: ms[0].index, len: ms[0][0].length, n: ms.length, text: ln.slice(Math.max(0, ms[0].index - 60), ms[0].index + 140), off: Math.max(0, ms[0].index - 60) });
        });
        if (f.count) { hits += f.count; files++; results.appendChild(Search.fileGroup(f, null, null, opts.q)); }
      }
      if (replace) {
        summary.textContent = replaced ? 'Замінено ' + fmtNum(replaced) + ' у ' + files + ' ' + plural(files, 'вкладці', 'вкладках', 'вкладках') + ' (ще не збережено)' : 'Нічого не знайдено';
        Tabs.render();
        if (replaced) UI.toast('Зміни можна скасувати у кожній вкладці');
      } else summary.textContent = hits ? fmtNum(hits) + ' ' + plural(hits, 'збіг', 'збіги', 'збігів') + ' у ' + files + ' ' + plural(files, 'вкладці', 'вкладках', 'вкладках') : 'Нічого не знайдено';
    };
  },

  /** $1, $& та \n у заміні для пошуку по вкладках. */
  expand(rep, m) {
    const groups = m.slice(0, -2).filter(x => typeof x === 'string' || x === undefined);
    if (!Search.opts.regex) return rep;
    return rep.replace(/\$(\d{1,2}|&)|\\(n|t)/g, (all, g, e) => {
      if (e) return e === 'n' ? '\n' : '\t';
      if (g === '&') return groups[0];
      return groups[+g] != null ? groups[+g] : '';
    });
  },

  fileGroup(f, ws, dir, q) {
    const full = f.path;
    const name = full.split('/').pop();
    const folder = full.slice(0, full.length - name.length).replace(/\/$/, '');
    const box = h('div', { class: 'fgroup' });
    const head = h('button', { class: 'fghead', onclick: () => box.classList.toggle('shut') },
      h('span', { class: 'tchev', html: ic('down') }), Langs.badgeEl(name),
      h('span', { class: 'fgname' }, h('b', { text: name }), folder ? h('small', { text: folder }) : null),
      h('span', { class: 'fgcount', text: f.count }));
    box.appendChild(head);
    for (const hit of f.hits) {
      const s = hit.text;
      const a = hit.col - hit.off;
      const row = h('button', {
        class: 'fhit', onclick: async () => {
          if (f.tab) { UI.closeAll(); Tabs.activate(f.tab); Edit.gotoLine(hit.line, hit.col, hit.len); return; }
          UI.closeAll();
          await Files.open(f.uri, { name, tree: ws.tree, docId: f.id, path: full, line: hit.line, col: hit.col, len: hit.len });
        },
      },
      h('span', { class: 'fln', text: hit.line + 1 }),
      h('span', { class: 'ftx', html: esc(s.slice(0, a).replace(/^\s+/, '')) + '<mark>' + esc(s.slice(a, a + hit.len)) + '</mark>' + esc(s.slice(a + hit.len)) }),
      hit.n > 1 ? h('span', { class: 'fn', text: '×' + hit.n }) : null);
      box.appendChild(row);
    }
    if (f.count > f.hits.reduce((a, x) => a + x.n, 0)) box.appendChild(h('div', { class: 'fmore', text: 'і ще в інших рядках…' }));
    return box;
  },
};
