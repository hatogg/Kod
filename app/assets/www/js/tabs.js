'use strict';
/* Вкладки: модель документа, смуга вкладок, відкриття/збереження/закриття, сесія і резервні копії. */

const UndoManager = ace.require('ace/undomanager').UndoManager;
const Whitespace = ace.require('ace/ext/whitespace');

const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Воркери перевірки помилок завантажуються як blob — так вони працюють на будь-якому WebView. */
const Workers = {
  MODES: { javascript: 'javascript', css: 'css', html: 'html', json: 'json', php: 'php', xml: 'xml', lua: 'lua', xquery: 'xquery', yaml: 'yaml', coffee: 'coffee' },
  ready: {},
  async ensure(mode) {
    const w = Workers.MODES[mode];
    if (!w) return false;
    if (Workers.ready[w]) return Workers.ready[w];
    Workers.ready[w] = (async () => {
      try {
        const r = await fetch('ace/worker-' + w + '.js');
        const src = await r.text();
        const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
        ace.config.setModuleUrl('ace/mode/' + w + '_worker', url);
        return true;
      } catch (e) {
        return false;
      }
    })();
    return Workers.ready[w];
  },
};

class Tab {
  constructor(o) {
    Object.assign(this, {
      id: uid(), name: 'новий 1', untitled: false,
      uri: null, tree: null, docId: null, path: null,
      enc: 'utf-8', bom: false, eol: 'LF', mixed: false,
      mode: 'text', readOnly: false, binary: false, big: false,
      mtime: -1, size: -1, writable: -1,
      forceDirty: false, loaded: true, session: null,
      bookmarks: new Set(), tabSize: 0, softTabs: null,
      wasDirty: false, pendingBackup: false,
    }, o);
  }

  get dirty() {
    if (!this.loaded) return !!this.metaDirty;
    return this.forceDirty || !!(this.session && !this.session.getUndoManager().isClean());
  }

  get encLabel() {
    const e = this.enc;
    const map = { 'utf-8': 'UTF-8', 'utf-16le': 'UTF-16 LE', 'utf-16be': 'UTF-16 BE' };
    let s = map[e] || (K.encodings.find(x => x[0] === e) || [0, e.toUpperCase()])[1].replace(/ \(.*\)$/, '');
    if (this.bom && e.startsWith('utf')) s += ' BOM';
    return s;
  }

  get place() {
    if (this.path) return (K.ws && K.ws.tree === this.tree ? K.ws.name + '/' : '') + this.path;
    if (this.uri) return decodeURIComponent((this.uri.split('/').pop() || '').replace(/^.*%3A/, '')).replace(/^.*:/, '') || this.name;
    return '';
  }
}

const Tabs = {
  // ---------------------------------------------------------------- створення

  /** Створює сесію Ace для вкладки з текстом. */
  attach(tab, text) {
    const s = ace.createEditSession(text, null);
    s.setUndoManager(new UndoManager());
    tab.session = s;
    tab.loaded = true;
    s.setOptions(Object.assign(Settings.sessionOptions(tab), { useWorker: false }));
    if (K.set.detectIndent && !tab.tabSize) {
      const d = Whitespace.$detectIndentation(s.doc.$lines);
      if (d && d.ch) { tab.softTabs = d.ch !== '\t'; if (d.length && d.ch !== '\t') tab.tabSize = d.length; }
      s.setOptions(Settings.sessionOptions(tab));
      s.setUseWorker(false);
    }
    Tabs.setMode(tab, tab.mode, true);
    for (const r of tab.bookmarks) s.setBreakpoint(r, 'kod-bm');
    s.on('change', d => Tabs.onChange(tab, d));
    s.on('changeAnnotation', () => { if (tab === K.cur && (typeof Status !== 'undefined')) Status.update(); });
    return s;
  },

  setMode(tab, mode, initial) {
    tab.mode = mode || 'text';
    if (!tab.session) return;
    tab.session.setMode('ace/mode/' + tab.mode);
    const useWorker = K.set.lint && !tab.big;
    tab.session.setUseWorker(false);
    if (useWorker && Workers.MODES[tab.mode]) {
      Workers.ensure(tab.mode).then(ok => {
        if (ok && tab.session && tab.mode === mode && K.set.lint) tab.session.setUseWorker(true);
      });
    }
    if (!initial) { Tabs.render(); if (tab === K.cur) Tabs.refreshChrome(); Session.save(); }
  },

  nextUntitled() {
    let n = 1;
    const used = new Set(K.tabs.filter(t => t.untitled).map(t => t.name));
    while (used.has('новий ' + n)) n++;
    return 'новий ' + n;
  },

  newTab(text = '', opts = {}) {
    const enc = K.set.newEnc === 'utf-8-bom' ? 'utf-8' : K.set.newEnc;
    const tab = new Tab(Object.assign({
      name: Tabs.nextUntitled(), untitled: true, enc, bom: K.set.newEnc === 'utf-8-bom', eol: K.set.newEol,
      mode: opts.mode || (text ? Langs.detect('', text) : 'text'),
    }, opts));
    Tabs.attach(tab, text);
    Tabs.add(tab);
    return tab;
  },

  add(tab, index) {
    if (index == null) {
      const i = K.cur ? K.tabs.indexOf(K.cur) : -1;
      index = i >= 0 ? i + 1 : K.tabs.length;
    }
    K.tabs.splice(index, 0, tab);
    Tabs.activate(tab);
    Session.save();
  },

  /** Порожня незмінена вкладка «новий N», яку можна замінити відкритим файлом. */
  isBlank(tab) {
    return tab && tab.untitled && tab.loaded && !tab.dirty && tab.session && tab.session.getLength() <= 1 && !tab.session.getLine(0);
  },

  // ---------------------------------------------------------------- активна вкладка

  activate(tab) {
    if (!tab) return;
    if (!tab.loaded && !Tabs.load(tab)) return;
    const prev = K.cur;
    if (prev && prev !== tab && prev.session) prev.lastScroll = { top: prev.session.getScrollTop(), left: prev.session.getScrollLeft() };
    K.cur = tab;
    K.ed.setSession(tab.session);
    K.ed.setReadOnly(!!tab.readOnly);
    Tabs.render();
    Tabs.refreshChrome();
    if ((typeof Search !== 'undefined')) Search.onTab();
    if ((typeof Sel !== 'undefined')) Sel.hide();
    Session.save();
  },

  /** Оновлює кнопки шапки, рядок стану, підсвітку вкладки. */
  refreshChrome() {
    const t = K.cur;
    if (!t) return;
    $('#bSave').classList.toggle('hot', t.dirty);
    const run = Langs.runKind(t);
    $('#bRun').hidden = !run;
    if ((typeof Status !== 'undefined')) Status.update();
    const el = $('#tabs .tab.on');
    if (el) el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  },

  /** Ліниве завантаження вкладки, відновленої із сесії. */
  load(tab) {
    let text = null;
    const backup = tab.metaDirty ? Native.backupGet(tab.id) : null;
    if (backup != null) text = backup;
    else if (tab.uri) {
      const r = Native.read(tab.uri, tab.enc);
      if (!r.ok) {
        UI.toast('Не вдалося відкрити «' + tab.name + '»: ' + Files.errText(r.err), { error: true });
        Tabs.removeTab(tab);
        return false;
      }
      text = r.text;
      Object.assign(tab, { mtime: r.mtime, size: r.size, eol: tab.metaEol || r.eol, writable: r.writable });
    } else text = Native.backupGet(tab.id) || '';
    Tabs.attach(tab, text);
    if (backup != null) tab.forceDirty = true;
    if (tab.cursor) {
      tab.session.selection.moveTo(tab.cursor.row, tab.cursor.column);
      if (tab.scroll) { tab.session.setScrollTop(tab.scroll.top); tab.session.setScrollLeft(tab.scroll.left || 0); }
    }
    if (tab.folds && tab.folds.length) {
      try {
        const Range = ace.require('ace/range').Range;
        for (const f of tab.folds) tab.session.addFold('...', new Range(f[0], f[1], f[2], f[3]));
      } catch (e) { /* згортки не збіглися з вмістом */ }
    }
    return true;
  },

  removeTab(tab) {
    const i = K.tabs.indexOf(tab);
    if (i < 0) return;
    K.tabs.splice(i, 1);
    Native.backupDel(tab.id);
    if (tab.session) tab.session.destroy && tab.session.destroy();
    if (K.cur === tab) {
      K.cur = null;
      const next = K.tabs[i] || K.tabs[i - 1];
      if (next) Tabs.activate(next); else Tabs.newTab();
    } else Tabs.render();
    Session.save();
  },

  // ---------------------------------------------------------------- зміни

  onChange(tab, delta) {
    Edit.shiftBookmarks(tab, delta);
    tab.pendingBackup = true;
    Session.backupSoon(tab);
    if (tab.dirty !== tab.wasDirty) {
      tab.wasDirty = tab.dirty;
      Tabs.render();
      if (tab === K.cur) $('#bSave').classList.toggle('hot', tab.dirty);
    }
    if (K.set.autosave === 'change' && tab.uri) Tabs.autosaveSoon();
  },

  autosaveSoon: debounce(() => {
    for (const t of K.tabs) if (t.loaded && t.dirty && t.uri && !t.readOnly) Tabs.save(t, { quiet: true });
  }, 2000),

  /** Після збереження або перезавантаження: стан «без змін». */
  markClean(tab) {
    tab.session.getUndoManager().markClean();
    tab.forceDirty = false;
    tab.wasDirty = false;
    Native.backupDel(tab.id);
    Tabs.render();
    if (tab === K.cur) Tabs.refreshChrome();
    Session.save();
  },

  // ---------------------------------------------------------------- збереження

  async save(tab, opts = {}) {
    tab = tab || K.cur;
    if (!tab || !tab.loaded) return true;
    if (!tab.uri) return opts.quiet ? false : Tabs.saveAs(tab);
    if (tab.readOnly && tab.binary) {
      if (!opts.quiet) UI.toast('Двійковий файл відкрито лише для читання');
      return false;
    }
    const text = tab.session.getValue();
    if (!/^utf|^gb18030$/.test(tab.enc)) {
      const n = Native.unmappable(text, tab.enc);
      if (n > 0 && !opts.quiet) {
        const v = await UI.dialog({
          title: 'Символи не вміщаються в ' + tab.encLabel,
          text: n + ' ' + plural(n, 'символ', 'символи', 'символів') + ' не можна записати в цьому кодуванні — вони стануть «?».',
          buttons: [{ label: 'Скасувати', value: null }, { label: 'UTF-8', value: 'utf8' }, { label: 'Записати', value: 'go', primary: true }],
        });
        if (!v) return false;
        if (v === 'utf8') { tab.enc = 'utf-8'; tab.bom = false; }
      } else if (n > 0) return false;
    }
    const r = Native.write(tab.uri, text, tab.enc, tab.bom, tab.eol);
    if (!r.ok) {
      if (opts.quiet) return false;
      if (r.err === 'access') {
        const go = await UI.confirm('Немає доступу до файлу', 'Цей файл відкрито лише для читання. Зберегти копію в іншому місці?', 'Зберегти як…');
        return go ? Tabs.saveAs(tab) : false;
      }
      UI.toast('Не вдалося зберегти: ' + Files.errText(r.err), { error: true });
      return false;
    }
    tab.mtime = r.mtime;
    tab.size = r.size;
    tab.mixed = false;
    tab.writable = 1;
    Tabs.markClean(tab);
    Recent.add(tab);
    if (!opts.quiet) UI.toast('Збережено «' + tab.name + '»');
    if (tab.tree && (typeof Workspace !== 'undefined')) Workspace.touched(tab);
    return true;
  },

  async saveAs(tab) {
    tab = tab || K.cur;
    if (!tab) return false;
    let name = tab.name;
    if (tab.untitled) name = name.replace(/ /g, '-') + '.' + Langs.extFor(tab.mode);
    const r = await Native.pick('save', name);
    if (!r || !r.ok) return false;
    const wasText = tab.mode === 'text' || tab.untitled;
    Object.assign(tab, { uri: r.uri, name: r.name || name, untitled: false, tree: null, docId: null, path: null, writable: 1, readOnly: false, binary: false });
    if (wasText) {
      const m = Langs.detect(tab.name, tab.session.getValue());
      if (m !== tab.mode) Tabs.setMode(tab, m);
    }
    K.ed.setReadOnly(K.cur.readOnly);
    tab.forceDirty = true;
    return Tabs.save(tab);
  },

  async saveAll() {
    let n = 0;
    for (const t of K.tabs.slice()) {
      if (!t.loaded || !t.dirty) continue;
      if (!t.uri) Tabs.activate(t);
      if (await Tabs.save(t, { quiet: !!t.uri })) n++;
    }
    UI.toast(n ? 'Збережено: ' + n + ' ' + plural(n, 'файл', 'файли', 'файлів') : 'Немає незбережених змін');
  },

  // ---------------------------------------------------------------- закриття

  async close(tab) {
    tab = tab || K.cur;
    if (!tab) return false;
    if (tab.dirty) {
      if (K.cur !== tab) Tabs.activate(tab);
      const v = await UI.dialog({
        title: 'Зберегти зміни?',
        text: 'У «' + tab.name + '» є незбережені зміни.',
        buttons: [{ label: 'Скасувати', value: null }, { label: 'Не зберігати', value: 'drop', danger: true }, { label: 'Зберегти', value: 'save', primary: true }],
      });
      if (!v) return false;
      if (v === 'save' && !(await Tabs.save(tab))) return false;
    }
    Tabs.removeTab(tab);
    return true;
  },

  async closeMany(list) {
    for (const t of list.slice()) if (!(await Tabs.close(t))) return false;
    return true;
  },

  // ---------------------------------------------------------------- перечитування

  /** Перечитати з диска (за потреби — в іншому кодуванні). Зміна потрапляє в історію «Скасувати». */
  async reload(tab, enc, quiet) {
    tab = tab || K.cur;
    if (!tab || !tab.uri) return;
    if (tab.dirty && !quiet && !(await UI.confirm('Перечитати з диска?', 'Незбережені зміни у «' + tab.name + '» буде втрачено (їх можна повернути через «Скасувати»).', 'Перечитати', true))) return;
    const r = Native.read(tab.uri, enc || tab.enc);
    if (!r.ok) { UI.toast('Не вдалося прочитати: ' + Files.errText(r.err), { error: true }); return; }
    const s = tab.session;
    const cur = s.selection.getCursor(), top = s.getScrollTop();
    if (s.getValue() !== r.text) s.doc.setValue(r.text);
    Object.assign(tab, { enc: r.enc, bom: r.bom, eol: r.eol, mixed: r.mixed, mtime: r.mtime, size: r.size, writable: r.writable });
    s.selection.moveTo(Math.min(cur.row, s.getLength() - 1), cur.column);
    s.setScrollTop(top);
    Tabs.markClean(tab);
    if (quiet) UI.toast('«' + tab.name + '» оновлено з диска');
  },

  /** Перевірка, чи файли не змінили інші програми. */
  async checkExternal() {
    for (const t of K.tabs.slice()) {
      if (!t.loaded || !t.uri || t.mtime <= 0 || t.checking) continue;
      const st = Native.stat(t.uri);
      if (!st.ok || st.mtime <= 0 || st.mtime === t.mtime) continue;
      if (Math.abs(st.mtime - t.mtime) < 1500 && st.size === t.size) { t.mtime = st.mtime; continue; }
      t.checking = true;
      if (!t.dirty && K.set.reloadSilently) await Tabs.reload(t, null, true);
      else {
        if (K.cur !== t) Tabs.activate(t);
        const v = await UI.dialog({
          title: 'Файл змінено іншою програмою',
          text: '«' + t.name + '» змінився на диску.' + (t.dirty ? ' У вкладці є ваші незбережені зміни.' : ''),
          buttons: [{ label: 'Лишити мою версію', value: 'keep' }, { label: 'Перечитати', value: 'reload', primary: true }],
        });
        if (v === 'reload') await Tabs.reload(t, null, true);
        else t.mtime = st.mtime;
      }
      t.checking = false;
    }
  },

  // ---------------------------------------------------------------- смуга вкладок

  render() {
    const box = $('#tabs');
    const frag = document.createDocumentFragment();
    for (const t of K.tabs) {
      const el = h('div', {
        class: 'tab' + (t === K.cur ? ' on' : '') + (t.dirty ? ' dirty' : '') + (t.readOnly ? ' ro' : ''),
        role: 'tab', 'data-id': t.id, title: t.place || t.name,
      },
      Langs.badgeEl(t.name),
      h('span', { class: 'tname', text: t.name }),
      h('button', { class: 'tx', 'aria-label': 'Закрити', html: '<i class="dot"></i>' + ic('x') }));
      frag.appendChild(el);
    }
    frag.appendChild(h('button', { class: 'tab add', 'aria-label': 'Новий файл', html: ic('plus') }));
    box.innerHTML = '';
    box.appendChild(frag);
  },

  bindStrip() {
    const box = $('#tabs');
    let timer = 0, longFired = false, startX = 0, startY = 0;
    box.addEventListener('pointerdown', e => {
      const el = e.target.closest('.tab');
      if (!el || el.classList.contains('add')) return;
      longFired = false;
      startX = e.clientX; startY = e.clientY;
      clearTimeout(timer);
      timer = setTimeout(() => {
        longFired = true;
        const t = K.tabs.find(x => x.id === el.dataset.id);
        if (t) Tabs.menu(t);
      }, 480);
    });
    box.addEventListener('pointermove', e => {
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 10) clearTimeout(timer);
    });
    box.addEventListener('pointerup', () => clearTimeout(timer));
    box.addEventListener('pointercancel', () => clearTimeout(timer));
    box.addEventListener('contextmenu', e => e.preventDefault());
    // після довгого натискання не пропускаємо «клацання», яке закрило б щойно відкрите меню
    box.addEventListener('touchend', e => { if (longFired && e.cancelable) e.preventDefault(); }, { passive: false });
    box.addEventListener('click', e => {
      if (longFired) { longFired = false; return; }
      const el = e.target.closest('.tab');
      if (!el) return;
      if (el.classList.contains('add')) { Tabs.newTab(); return; }
      const t = K.tabs.find(x => x.id === el.dataset.id);
      if (!t) return;
      if (e.target.closest('.tx')) Tabs.close(t);
      else if (t !== K.cur) Tabs.activate(t);
      else Tabs.menu(t);
    });
  },

  menu(t) {
    const i = K.tabs.indexOf(t);
    UI.menu([
      { header: t.place || t.name },
      { icon: 'save', label: 'Зберегти', hint: 'Ctrl+S', run: () => Tabs.save(t) },
      { icon: 'download', glyph: '⤓', label: 'Зберегти як…', run: () => Tabs.saveAs(t) },
      t.uri ? { icon: 'refresh', label: 'Перечитати з диска', run: () => Tabs.reload(t) } : null,
      (t.tree || t.untitled) ? { icon: 'pencil', label: 'Перейменувати…', run: () => Files.renameTab(t) } : null,
      '-',
      { icon: 'x', label: 'Закрити', hint: 'Ctrl+W', run: () => Tabs.close(t) },
      K.tabs.length > 1 ? { icon: 'x', label: 'Закрити інші', run: () => Tabs.closeMany(K.tabs.filter(x => x !== t)) } : null,
      i < K.tabs.length - 1 ? { icon: 'right', label: 'Закрити праворуч', run: () => Tabs.closeMany(K.tabs.slice(i + 1)) } : null,
      { icon: 'x', label: 'Закрити всі', run: () => Tabs.closeMany(K.tabs.slice()) },
      '-',
      i > 0 ? { icon: 'left', label: 'Перемістити ліворуч', run: () => Tabs.move(t, -1) } : null,
      i < K.tabs.length - 1 ? { icon: 'right', label: 'Перемістити праворуч', run: () => Tabs.move(t, 1) } : null,
      { icon: 'lock', label: 'Тільки читання', checked: !!t.readOnly, run: () => Edit.toggleReadOnly(t) },
      K.tabs.length > 1 || t.uri ? { icon: 'columns', label: 'Порівняти з…', run: () => Tools.compare(t) } : null,
      '-',
      { icon: 'copy', label: 'Копіювати назву', run: () => { Native.clipSet(t.name); UI.toast('Скопійовано'); } },
      t.place ? { icon: 'copy', label: 'Копіювати шлях', run: () => { Native.clipSet(t.place); UI.toast('Скопійовано'); } } : null,
      { icon: 'share', label: 'Поділитися файлом', run: () => Native.share(t.session ? t.session.getValue() : '', t.untitled ? t.name + '.' + Langs.extFor(t.mode) : t.name) },
      t.uri ? { icon: 'external', label: 'Відкрити в іншому застосунку', run: () => Native.view(t.uri, Files.mime(t.name)) } : null,
    ], t.name);
  },

  move(t, d) {
    const i = K.tabs.indexOf(t), j = i + d;
    if (j < 0 || j >= K.tabs.length) return;
    K.tabs.splice(i, 1);
    K.tabs.splice(j, 0, t);
    Tabs.render();
    Session.save();
  },

  cycle(d) {
    if (K.tabs.length < 2) return;
    const i = K.tabs.indexOf(K.cur);
    Tabs.activate(K.tabs[(i + d + K.tabs.length) % K.tabs.length]);
  },
};

// ==================================================================== відкриття файлів

const Files = {
  errText(err) {
    return { big: 'файл завеликий (понад 32 МБ)', access: 'немає доступу', bridge: 'помилка застосунку' }[err] || (err || 'невідома помилка');
  },

  mime(name) {
    const e = Langs.ext(name);
    return { html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json', md: 'text/markdown', xml: 'text/xml', svg: 'image/svg+xml' }[e] || 'text/plain';
  },

  async pickOpen() {
    const r = await Native.pick('open');
    if (!r || !r.ok) return;
    for (const f of r.files || []) await Files.open(f.uri, { name: f.name });
  },

  findTab(uri) {
    return K.tabs.find(t => t.uri === uri);
  },

  /** Відкрити документ за URI. extra: {name, tree, docId, path, line, col} */
  async open(uri, extra = {}) {
    const existing = Files.findTab(uri);
    if (existing) {
      Tabs.activate(existing);
      if (extra.line != null) Edit.gotoLine(extra.line, extra.col || 0, extra.len);
      return existing;
    }
    const r = Native.read(uri, 'auto');
    if (!r.ok) {
      UI.toast('Не вдалося відкрити' + (extra.name ? ' «' + extra.name + '»' : '') + ': ' + Files.errText(r.err), { error: true });
      Recent.remove(uri);
      return null;
    }
    const big = r.size > 6 * 1024 * 1024;
    if (big && !(await UI.confirm('Великий файл', '«' + r.name + '» — ' + fmtSize(r.size) + '. Відкрити без підсвітки й перевірки помилок?', 'Відкрити'))) return null;
    let readOnly = false;
    if (r.binary) {
      const v = await UI.dialog({
        title: 'Схоже на двійковий файл',
        text: '«' + r.name + '» містить нульові байти. Збереження може зіпсувати такий файл.',
        buttons: [{ label: 'Скасувати', value: null }, { label: 'Тільки читання', value: 'ro', primary: true }, { label: 'Редагувати', value: 'rw' }],
      });
      if (!v) return null;
      readOnly = v === 'ro';
    }
    const tab = new Tab({
      name: extra.name || r.name, uri, tree: extra.tree || null, docId: extra.docId || null, path: extra.path || null,
      enc: r.enc, bom: r.bom, eol: r.eol, mixed: r.mixed, binary: r.binary, readOnly, big,
      mtime: r.mtime, size: r.size, writable: r.writable,
    });
    tab.mode = big ? 'text' : Langs.detect(tab.name, r.text);
    Tabs.attach(tab, r.text);
    const blank = Tabs.isBlank(K.cur) ? K.cur : null;
    Tabs.add(tab);
    if (blank) Tabs.removeTab(blank);
    Recent.add(tab);
    if (r.mixed) UI.toast('У файлі змішані кінці рядків — під час збереження стануть ' + r.eol);
    if (extra.line != null) setTimeout(() => Edit.gotoLine(extra.line, extra.col || 0, extra.len), 30);
    return tab;
  },

  async renameTab(t) {
    if (t.untitled) {
      const v = await UI.prompt('Назва вкладки', t.name);
      if (v && v.trim()) { t.name = v.trim(); Tabs.render(); Session.save(); }
      return;
    }
    if (t.tree && (typeof Workspace !== 'undefined')) Workspace.renameTab(t);
  },
};

// ==================================================================== недавні файли

const Recent = {
  list: [],
  load() { Recent.list = Native.kvGet('recent', []) || []; },
  save() { Native.kvPut('recent', Recent.list); },
  add(tab) {
    if (!tab.uri) return;
    Recent.list = Recent.list.filter(r => r.uri !== tab.uri);
    Recent.list.unshift({ uri: tab.uri, name: tab.name, tree: tab.tree, docId: tab.docId, path: tab.path, t: Date.now() });
    if (Recent.list.length > 40) {
      const gone = Recent.list.splice(40);
      Recent.releaseUnused(gone);
    }
    Recent.save();
  },
  remove(uri) {
    Recent.list = Recent.list.filter(r => r.uri !== uri);
    Recent.save();
  },
  clear() {
    const gone = Recent.list;
    Recent.list = [];
    Recent.save();
    Recent.releaseUnused(gone);
  },
  /** Звільнити постійні дозволи на файли, яких більше немає ні у вкладках, ні в недавніх. */
  releaseUnused(gone) {
    const keep = new Set(K.tabs.map(t => t.uri).concat(Recent.list.map(r => r.uri)));
    if (K.ws) keep.add(K.ws.tree);
    for (const r of gone) if (r.uri && !r.tree && !keep.has(r.uri)) Native.release(r.uri);
  },
};

// ==================================================================== сесія

const Session = {
  meta(t) {
    const s = t.session;
    const o = {
      id: t.id, name: t.name, untitled: t.untitled, uri: t.uri, tree: t.tree, docId: t.docId, path: t.path,
      enc: t.enc, bom: t.bom, eol: t.eol, mode: t.mode, readOnly: t.readOnly, binary: t.binary, big: t.big,
      mtime: t.mtime, size: t.size, tabSize: t.tabSize, softTabs: t.softTabs,
      dirty: t.dirty, bookmarks: Array.from(t.bookmarks),
    };
    if (s) {
      const c = s.selection.getCursor();
      o.cursor = { row: c.row, column: c.column };
      o.scroll = { top: s.getScrollTop(), left: s.getScrollLeft() };
      o.folds = s.getAllFolds().slice(0, 200).map(f => [f.start.row, f.start.column, f.end.row, f.end.column]);
    } else {
      o.cursor = t.cursor; o.scroll = t.scroll; o.folds = t.folds;
    }
    return o;
  },

  write() {
    if (!K.tabs.length) return;
    Native.kvPut('session', {
      v: 1,
      active: K.cur ? K.cur.id : null,
      tabs: K.tabs.map(Session.meta),
      ws: K.ws ? { tree: K.ws.tree, name: K.ws.name, open: Array.from(K.ws.open || []) } : null,
    });
  },

  save: debounce(() => Session.write(), 700),

  /** Резервна копія незбережених вкладок. Для великих файлів — рідше. */
  backupSoon(tab) {
    const big = tab.session && tab.session.getLength() > 20000;
    clearTimeout(tab._bt);
    tab._bt = setTimeout(() => Session.backup(tab), big ? 5000 : 1200);
  },

  backup(tab) {
    clearTimeout(tab._bt);
    if (!tab.loaded || !tab.pendingBackup) return;
    tab.pendingBackup = false;
    if (tab.dirty) Native.backupPut(tab.id, tab.session.getValue());
    else Native.backupDel(tab.id);
    Session.save();
  },

  flush() {
    for (const t of K.tabs) Session.backup(t);
    Session.save.cancel();
    Session.write();
  },

  restore() {
    const s = K.set.restore ? Native.kvGet('session', null) : null;
    const keys = new Set(Native.backupKeys());
    if (!s || !s.tabs || !s.tabs.length) {
      for (const k of keys) Native.backupDel(k);
      return false;
    }
    for (const m of s.tabs) {
      const hasBackup = keys.has(m.id);
      if (!m.uri && !m.dirty && !hasBackup && !m.untitled) continue;
      const tab = new Tab({
        id: m.id, name: m.name, untitled: !!m.untitled, uri: m.uri, tree: m.tree, docId: m.docId, path: m.path,
        enc: m.enc || 'utf-8', bom: !!m.bom, eol: m.eol || 'LF', mode: m.mode || 'text', readOnly: !!m.readOnly,
        binary: !!m.binary, big: !!m.big, mtime: m.mtime, size: m.size, tabSize: m.tabSize || 0, softTabs: m.softTabs,
        bookmarks: new Set(m.bookmarks || []), cursor: m.cursor, scroll: m.scroll, folds: m.folds,
        loaded: false, metaDirty: !!(m.dirty && hasBackup), metaEol: m.eol,
      });
      K.tabs.push(tab);
      keys.delete(m.id);
    }
    for (const k of keys) Native.backupDel(k); // копії вкладок, яких уже немає
    if (s.ws && s.ws.tree) K.wsRestore = s.ws;
    if (!K.tabs.length) return false;
    let active = K.tabs.find(t => t.id === s.active) || K.tabs[0];
    while (active && !K.cur) {
      Tabs.activate(active);
      if (!K.cur) active = K.tabs[0];
    }
    return !!K.cur;
  },
};
