'use strict';
/* Операції редагування: закладки, перетворення тексту, рядки, регістр, кодування, кінці рядків, відступи. */

const Edit = {
  // ---------------------------------------------------------------- навігація

  gotoLine(row, col = 0, len = 0) {
    const s = K.cur.session;
    row = clamp(row, 0, s.getLength() - 1);
    col = clamp(col, 0, s.getLine(row).length);
    s.unfold({ row, column: col });
    K.ed.clearSelection();
    if (len) K.ed.selection.setSelectionRange(new Range(row, col, row, col + len));
    else K.ed.moveCursorTo(row, col);
    K.ed.renderer.scrollCursorIntoView({ row, column: col }, 0.4);
    K.ed.focus();
  },

  // ---------------------------------------------------------------- закладки

  setBookmark(tab, row, on) {
    if (on) { tab.bookmarks.add(row); tab.session.setBreakpoint(row, 'kod-bm'); }
    else { tab.bookmarks.delete(row); tab.session.clearBreakpoint(row); }
    Session.save();
  },

  toggleBookmark(row) {
    const t = K.cur;
    if (row == null) row = K.ed.getCursorPosition().row;
    Edit.setBookmark(t, row, !t.bookmarks.has(row));
  },

  nextBookmark(back) {
    const t = K.cur;
    const rows = Array.from(t.bookmarks).sort((a, b) => a - b);
    if (!rows.length) { UI.toast('Закладок немає. Торкніться номера рядка, щоб поставити'); return; }
    const cur = K.ed.getCursorPosition().row;
    let r = back ? rows.filter(x => x < cur).pop() : rows.find(x => x > cur);
    if (r == null) r = back ? rows[rows.length - 1] : rows[0];
    Edit.gotoLine(r, 0);
  },

  clearBookmarks() {
    const t = K.cur;
    t.bookmarks.clear();
    t.session.clearBreakpoints();
    Session.save();
  },

  bookmarkedLines() {
    const t = K.cur;
    return Array.from(t.bookmarks).sort((a, b) => a - b).filter(r => r < t.session.getLength());
  },

  copyBookmarked(cut) {
    const rows = Edit.bookmarkedLines();
    if (!rows.length) { UI.toast('Закладок немає'); return; }
    const s = K.cur.session;
    Native.clipSet(rows.map(r => s.getLine(r)).join('\n'));
    if (cut) Edit.deleteBookmarked(true);
    UI.toast((cut ? 'Вирізано' : 'Скопійовано') + ' рядків: ' + rows.length);
  },

  deleteBookmarked(silent) {
    const rows = Edit.bookmarkedLines();
    if (!rows.length) { if (!silent) UI.toast('Закладок немає'); return; }
    const s = K.cur.session;
    for (const r of rows.slice().reverse()) s.doc.removeFullLines(r, r);
    Edit.clearBookmarks();
    if (!silent) UI.toast('Видалено рядків: ' + rows.length);
  },

  listBookmarks() {
    const rows = Edit.bookmarkedLines();
    if (!rows.length) { UI.toast('Закладок немає. Торкніться номера рядка, щоб поставити'); return; }
    const s = K.cur.session;
    UI.choose('Закладки', rows.map(r => ({ value: r, glyph: String(r + 1), label: s.getLine(r).trim().slice(0, 80) || '(порожній рядок)' }))).then(r => { if (r != null) Edit.gotoLine(r, 0); });
  },

  /** Зсув закладок разом із текстом. */
  shiftBookmarks(tab, d) {
    if (!tab.bookmarks.size) return;
    const n = d.end.row - d.start.row;
    if (!n) return;
    const next = new Set();
    for (const r of tab.bookmarks) {
      if (d.action === 'insert') {
        if (r > d.start.row || (r === d.start.row && d.start.column === 0 && tab.session.getLine(d.end.row).length > 0)) next.add(r + n);
        else next.add(r);
      } else {
        if (r > d.end.row) next.add(r - n);
        else if (r > d.start.row) next.add(d.start.row);
        else next.add(r);
      }
    }
    tab.bookmarks = next;
    tab.session.clearBreakpoints();
    for (const r of next) tab.session.setBreakpoint(r, 'kod-bm');
  },

  // ---------------------------------------------------------------- буфер обміну

  copy() {
    const t = K.ed.getCopyText();
    if (!t) { UI.toast('Нічого не виділено'); return; }
    Native.clipSet(t);
    UI.toast('Скопійовано');
  },

  cut() {
    if (K.ed.getReadOnly()) return;
    const t = K.ed.getCopyText();
    if (!t) return;
    Native.clipSet(t);
    K.ed.execCommand('cut');
  },

  paste() {
    if (K.ed.getReadOnly()) return;
    const t = Native.clipGet();
    if (!t) { UI.toast('Буфер обміну порожній'); return; }
    K.ed.execCommand('paste', t);
  },

  // ---------------------------------------------------------------- перетворення тексту

  /** Діапазон для операцій над рядками: виділені рядки або весь файл. */
  lineRange() {
    const s = K.cur.session;
    const r = K.ed.getSelectionRange();
    if (r.isEmpty()) return { first: 0, last: s.getLength() - 1, all: true };
    let last = r.end.row;
    if (r.end.column === 0 && last > r.start.row) last--;
    return { first: r.start.row, last, all: false };
  },

  mapLines(fn, label) {
    if (K.ed.getReadOnly()) return;
    const s = K.cur.session;
    const { first, last } = Edit.lineRange();
    const lines = [];
    for (let i = first; i <= last; i++) lines.push(s.getLine(i));
    const out = fn(lines);
    if (out == null) return;
    const before = lines.join('\n'), after = out.join('\n');
    if (before === after) { UI.toast('Без змін'); return; }
    const range = new Range(first, 0, last, s.getLine(last).length);
    s.replace(range, after);
    const diff = lines.length - out.length;
    if (label) UI.toast(label + (diff > 0 ? ': −' + diff + ' ' + plural(diff, 'рядок', 'рядки', 'рядків') : ''));
  },

  /** Перетворення виділеного тексту (або слова під курсором / усього файлу). */
  mapText(fn, wholeIfEmpty) {
    if (K.ed.getReadOnly()) return;
    const s = K.cur.session;
    const ranges = K.ed.selection.getAllRanges ? K.ed.selection.getAllRanges() : [K.ed.getSelectionRange()];
    const work = ranges.filter(r => !r.isEmpty());
    if (!work.length) {
      if (wholeIfEmpty) {
        const all = new Range(0, 0, s.getLength() - 1, s.getLine(s.getLength() - 1).length);
        work.push(all);
      } else {
        const c = K.ed.getCursorPosition();
        const w = s.getWordRange(c.row, c.column);
        if (w.isEmpty()) return;
        work.push(w);
      }
    }
    let err = null;
    for (const r of work.slice().reverse()) {
      const src = s.getTextRange(r);
      let out;
      try { out = fn(src); } catch (e) { err = e; continue; }
      if (out != null && out !== src) {
        const end = s.replace(r, out);
        if (work.length === 1) K.ed.selection.setSelectionRange(new Range(r.start.row, r.start.column, end.row, end.column));
      }
    }
    if (err) UI.toast(err.message || String(err), { error: true });
  },

  titleCase: s => s.toLocaleLowerCase('uk').replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('uk')),
  sentenceCase: s => s.toLocaleLowerCase('uk').replace(/(^\s*|[.!?…]\s+)(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('uk')),
  invertCase: s => Array.from(s).map(c => { const u = c.toLocaleUpperCase('uk'); return u === c ? c.toLocaleLowerCase('uk') : u; }).join(''),

  sort(kind) {
    const coll = new Intl.Collator('uk', { numeric: kind === 'num', sensitivity: kind === 'ci' ? 'base' : 'variant' });
    Edit.mapLines(lines => {
      const a = lines.slice();
      if (kind === 'len') a.sort((x, y) => x.length - y.length || coll.compare(x, y));
      else if (kind === 'num') a.sort((x, y) => (parseFloat(x.replace(',', '.')) || 0) - (parseFloat(y.replace(',', '.')) || 0) || coll.compare(x, y));
      else a.sort(coll.compare);
      if (kind === 'desc') a.reverse();
      return a;
    }, 'Відсортовано');
  },

  reverseLines() { Edit.mapLines(l => l.slice().reverse(), 'Порядок рядків змінено'); },

  dedupe(adjacent) {
    Edit.mapLines(lines => {
      if (adjacent) return lines.filter((l, i) => i === 0 || l !== lines[i - 1]);
      const seen = new Set();
      return lines.filter(l => (seen.has(l) ? false : (seen.add(l), true)));
    }, 'Дублікати видалено');
  },

  removeEmpty(ws) { Edit.mapLines(l => l.filter(x => ws ? x.trim() !== '' : x !== ''), 'Порожні рядки видалено'); },
  trim(where) {
    Edit.mapLines(l => l.map(x => where === 'end' ? x.replace(/\s+$/, '') : where === 'start' ? x.replace(/^\s+/, '') : x.trim()), 'Пробіли прибрано');
  },

  joinLines() {
    if (K.ed.getReadOnly()) return;
    const r = K.ed.getSelectionRange();
    if (r.isEmpty() || r.start.row === r.end.row) { K.ed.execCommand('joinlines'); return; }
    Edit.mapLines(l => [l.map((x, i) => i ? x.trim() : x.replace(/\s+$/, '')).join(' ')]);
  },

  tabsToSpaces() {
    const ts = K.cur.session.getTabSize();
    Edit.mapLines(l => l.map(x => {
      let out = '';
      for (const ch of x) out += ch === '\t' ? ' '.repeat(ts - (out.length % ts)) : ch;
      return out;
    }), 'Табуляції замінено пробілами');
  },

  leadingSpacesToTabs() {
    const ts = K.cur.session.getTabSize();
    Edit.mapLines(l => l.map(x => x.replace(/^[ \t]+/, m => {
      let w = 0;
      for (const ch of m) w += ch === '\t' ? ts - (w % ts) : 1;
      return '\t'.repeat(Math.floor(w / ts)) + ' '.repeat(w % ts);
    })), 'Відступи замінено табуляціями');
  },

  /** Вставити числа з кроком у кожен курсор (як «Редактор колонок» Notepad++). */
  async insertSequence() {
    const ranges = K.ed.selection.getAllRanges();
    if (ranges.length < 2) {
      UI.toast('Спершу поставте кілька курсорів: «Блочне виділення» або «Виділити всі» в пошуку');
      return;
    }
    const v = await UI.prompt('Послідовність чисел', '1, 1', { note: 'Початок і крок через кому. Додайте 0 попереду для вирівнювання: 01, 1', ok: 'Вставити' });
    if (v == null) return;
    const m = /^\s*(-?\d+)\s*(?:[,; ]\s*(-?\d+))?\s*$/.exec(v);
    if (!m) { UI.toast('Формат: початок, крок'); return; }
    const start = +m[1], step = m[2] != null ? +m[2] : 1;
    const pad = /^-?0\d/.test(m[1]) ? m[1].replace('-', '').length : 0;
    const sorted = ranges.slice().sort((a, b) => a.start.row - b.start.row || a.start.column - b.start.column);
    const s = K.cur.session;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const n = start + step * i;
      s.replace(sorted[i], pad ? String(Math.abs(n)).padStart(pad, '0').replace(/^/, n < 0 ? '-' : '') : String(n));
    }
  },

  /** Перетворити звичайне виділення на прямокутне (блочне). */
  blockSelect() {
    const sel = K.ed.selection;
    const r = sel.getRange();
    if (r.isEmpty() || r.start.row === r.end.row) {
      UI.toast('Виділіть кілька рядків — від верхнього лівого кута до нижнього правого');
      return;
    }
    const s = K.cur.session;
    const c1 = Math.min(r.start.column, r.end.column), c2 = Math.max(r.start.column, r.end.column);
    sel.toSingleRange();
    const ranges = [];
    for (let row = r.start.row; row <= r.end.row; row++) {
      const len = s.getLine(row).length;
      ranges.push(new Range(row, Math.min(c1, len), row, Math.min(c2, len)));
    }
    sel.setSelectionRange(ranges[0]);
    for (let i = 1; i < ranges.length; i++) sel.addRange(ranges[i], true);
    UI.toast('Блок: ' + ranges.length + ' ' + plural(ranges.length, 'рядок', 'рядки', 'рядків'));
  },

  cursorsAtLineEnds() {
    const r = K.ed.getSelectionRange();
    if (r.start.row === r.end.row) { UI.toast('Виділіть кілька рядків'); return; }
    K.ed.execCommand('splitSelectionIntoLines');
    const sel = K.ed.selection;
    const ranges = sel.getAllRanges().map(x => new Range(x.end.row, x.end.column, x.end.row, x.end.column));
    sel.toSingleRange();
    sel.setSelectionRange(ranges[0]);
    for (let i = 1; i < ranges.length; i++) sel.addRange(ranges[i], true);
  },

  insertDate(fmt) {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const iso = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    const time = p(d.getHours()) + ':' + p(d.getMinutes());
    const s = {
      iso, time, isoTime: iso + ' ' + time,
      uk: p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear(),
      long: d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }),
      stamp: String(Math.floor(d.getTime() / 1000)),
      full: d.toISOString(),
    }[fmt];
    K.ed.insert(s);
  },

  // ---------------------------------------------------------------- кодування й кінці рядків

  async encodingMenu() {
    const t = K.cur;
    const list = K.encodings.length ? K.encodings : [['utf-8', 'UTF-8']];
    const items = [{ header: 'Зараз: ' + t.encLabel + (t.uri ? '' : ' (новий файл)') }];
    items.push({ icon: 'enc', label: 'Перетворити на…', sub: 'Змінити кодування для збереження', run: () => Edit.convertEncoding() });
    if (t.uri) items.push({ icon: 'refresh', label: 'Перечитати як…', sub: 'Якщо текст показано «кракозябрами»', run: () => Edit.reopenEncoding() });
    UI.menu(items, 'Кодування');
    return list;
  },

  async convertEncoding() {
    const t = K.cur;
    const opts = [
      { value: 'utf-8|0', label: 'UTF-8', checked: t.enc === 'utf-8' && !t.bom },
      { value: 'utf-8|1', label: 'UTF-8 з BOM', checked: t.enc === 'utf-8' && t.bom },
      { value: 'utf-16le|1', label: 'UTF-16 LE з BOM', checked: t.enc === 'utf-16le' },
      { value: 'utf-16be|1', label: 'UTF-16 BE з BOM', checked: t.enc === 'utf-16be' },
      '-',
    ].concat(K.encodings.filter(e => !e[0].startsWith('utf')).map(e => ({ value: e[0] + '|0', label: e[1], checked: t.enc === e[0] })));
    const v = await UI.choose('Перетворити на', opts, { search: 'Пошук кодування' });
    if (!v) return;
    const [enc, bom] = v.split('|');
    if (enc === t.enc && (bom === '1') === t.bom) return;
    const n = /^utf/.test(enc) ? 0 : Native.unmappable(t.session.getValue(), enc);
    if (n && !(await UI.confirm('Деякі символи буде втрачено', n + ' ' + plural(n, 'символ', 'символи', 'символів') + ' не існує в ' + enc.toUpperCase() + ' — під час збереження вони стануть «?».', 'Перетворити', true))) return;
    t.enc = enc;
    t.bom = bom === '1';
    t.forceDirty = true;
    Tabs.render();
    Tabs.refreshChrome();
    Session.save();
    UI.toast('Кодування: ' + t.encLabel + ' — збережіть файл');
  },

  async reopenEncoding() {
    const t = K.cur;
    const opts = [{ value: 'auto', label: 'Визначити автоматично' }, '-']
      .concat(K.encodings.map(e => ({ value: e[0], label: e[1], checked: t.enc === e[0] })));
    const v = await UI.choose('Перечитати як', opts, { search: 'Пошук кодування' });
    if (!v) return;
    await Tabs.reload(t, v);
  },

  async eolMenu() {
    const t = K.cur;
    const v = await UI.choose('Кінці рядків', [
      { value: 'CRLF', label: 'Windows (CR LF)', sub: '\\r\\n — Windows, Notepad', checked: t.eol === 'CRLF' },
      { value: 'LF', label: 'Unix (LF)', sub: '\\n — Linux, macOS, Android, Git', checked: t.eol === 'LF' },
      { value: 'CR', label: 'Macintosh (CR)', sub: '\\r — старі Mac OS', checked: t.eol === 'CR' },
    ]);
    if (!v || v === t.eol) return;
    t.eol = v;
    t.mixed = false;
    t.forceDirty = true;
    Tabs.render();
    Tabs.refreshChrome();
    Session.save();
  },

  // ---------------------------------------------------------------- відступи

  async indentMenu() {
    const t = K.cur;
    const s = t.session;
    const soft = s.getUseSoftTabs(), size = s.getTabSize();
    const v = await UI.choose('Відступи', [
      { header: 'Для цього файлу' },
      { value: 's2', label: 'Пробіли: 2', checked: soft && size === 2 },
      { value: 's4', label: 'Пробіли: 4', checked: soft && size === 4 },
      { value: 's8', label: 'Пробіли: 8', checked: soft && size === 8 },
      { value: 't2', label: 'Табуляція (ширина 2)', checked: !soft && size === 2 },
      { value: 't4', label: 'Табуляція (ширина 4)', checked: !soft && size === 4 },
      { value: 't8', label: 'Табуляція (ширина 8)', checked: !soft && size === 8 },
      '-',
      { value: 'detect', label: 'Визначити з вмісту', icon: 'search' },
      { value: 'toSpaces', label: 'Перетворити відступи на пробіли', icon: 'indent' },
      { value: 'toTabs', label: 'Перетворити відступи на табуляцію', icon: 'indent' },
    ]);
    if (!v) return;
    if (v === 'detect') {
      const d = Whitespace.$detectIndentation(s.doc.$lines);
      if (d && d.ch) { t.softTabs = d.ch !== '\t'; if (d.length) t.tabSize = d.length; s.setOptions(Settings.sessionOptions(t)); UI.toast(t.softTabs ? 'Пробіли: ' + s.getTabSize() : 'Табуляція'); }
      else UI.toast('Не вдалося визначити — у файлі немає відступів');
    } else if (v === 'toSpaces' || v === 'toTabs') {
      if (K.ed.getReadOnly()) return;
      Whitespace.convertIndentation(s, v === 'toTabs' ? '\t' : ' ', s.getTabSize());
      t.softTabs = v === 'toSpaces';
      s.setUseSoftTabs(t.softTabs);
    } else {
      t.softTabs = v[0] === 's';
      t.tabSize = +v.slice(1);
      s.setOptions(Settings.sessionOptions(t));
    }
    Status.update();
    Session.save();
  },

  toggleReadOnly(t) {
    t = t || K.cur;
    t.readOnly = !t.readOnly;
    if (t === K.cur) K.ed.setReadOnly(t.readOnly);
    Tabs.render();
    Status.update();
    Session.save();
    UI.toast(t.readOnly ? 'Тільки читання — випадково не зміните' : 'Редагування дозволено');
  },

  async setLanguage() {
    const t = K.cur;
    const pop = new Set(Langs.POPULAR);
    const all = Langs.modes();
    const opt = m => ({ value: m.name, label: m.caption, hint: m.extensions.split('|').filter(x => !x.startsWith('^')).slice(0, 3).map(x => '.' + x).join(' '), checked: m.name === t.mode });
    const v = await UI.choose('Синтаксис', [{ header: 'Популярні' }]
      .concat(all.filter(m => pop.has(m.name)).map(opt), [{ header: 'Усі мови (' + all.length + ')' }], all.filter(m => !pop.has(m.name)).map(opt)),
    { search: 'Пошук мови або розширення', full: true });
    if (v) Tabs.setMode(t, v);
  },

  stats() {
    const s = K.cur.session;
    const sel = K.ed.getSelectedText();
    const calc = text => {
      const words = (text.match(/[\p{L}\p{N}_'’-]+/gu) || []).length;
      const bytes = new TextEncoder().encode(text).length;
      return {
        chars: Array.from(text).length,
        noSpace: Array.from(text.replace(/\s/g, '')).length,
        words, bytes,
        lines: text ? text.split('\n').length : 0,
        paras: text.split(/\n\s*\n/).filter(x => x.trim()).length,
      };
    };
    const a = calc(s.getValue());
    const b = sel ? calc(sel) : null;
    const row = (label, k) => '<tr><td>' + label + '</td><td>' + fmtNum(a[k]) + '</td>' + (b ? '<td>' + fmtNum(b[k]) + '</td>' : '') + '</tr>';
    UI.dialog({
      title: 'Статистика',
      html: '<table class="stats"><tr><th></th><th>Файл</th>' + (b ? '<th>Виділене</th>' : '') + '</tr>' +
        row('Символів', 'chars') + row('Без пробілів', 'noSpace') + row('Слів', 'words') + row('Рядків', 'lines') + row('Абзаців', 'paras') + row('Байтів (UTF-8)', 'bytes') + '</table>' +
        (K.cur.size >= 0 ? '<p class="dnote">На диску: ' + fmtSize(K.cur.size) + ' · ' + esc(K.cur.encLabel) + ' · ' + K.cur.eol + '</p>' : ''),
    });
  },
};

// ==================================================================== рядок стану

const Status = {
  update() {
    const t = K.cur, el = $('#status');
    if (!t || !t.session || !el) return;
    const ed = K.ed;
    const c = ed.getCursorPosition();
    const sel = ed.getSelectedText();
    const multi = ed.selection.getAllRanges ? ed.selection.getAllRanges().length : 1;
    const ann = t.session.getAnnotations();
    const errs = ann.filter(a => a.type === 'error').length, warns = ann.filter(a => a.type === 'warning').length;
    const s = t.session;
    const parts = [];
    parts.push('<button data-a="goto"><span><b>' + (c.row + 1) + '</b>:' + (c.column + 1) + '</span>' + (sel ? '<span class="dim">' + (multi > 1 ? multi + ' курс.' : 'виділ. ' + fmtNum(sel.length)) + '</span>' : '') + '</button>');
    if (errs || warns) parts.push('<button data-a="problems" class="' + (errs ? 'err' : 'warn') + '">' + ic('alert') + (errs + warns) + '</button>');
    if (Macro.recording) parts.push('<button data-a="macro" class="rec">' + ic('record') + 'запис</button>');
    if (t.readOnly) parts.push('<button data-a="ro" class="ro">' + ic('lock') + '</button>');
    parts.push('<span class="sp"></span>');
    parts.push('<button data-a="lang">' + esc(Langs.caption(t.mode)) + '</button>');
    parts.push('<button data-a="indent">' + (s.getUseSoftTabs() ? 'Пробіли ' : 'Tab ') + s.getTabSize() + '</button>');
    parts.push('<button data-a="enc">' + esc(t.encLabel) + '</button>');
    parts.push('<button data-a="eol"' + (t.mixed ? ' class="warn"' : '') + '>' + t.eol + '</button>');
    el.innerHTML = parts.join('');
  },

  bind() {
    $('#status').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'goto') Search.gotoLine();
      else if (a === 'lang') Edit.setLanguage();
      else if (a === 'enc') Edit.encodingMenu();
      else if (a === 'eol') Edit.eolMenu();
      else if (a === 'indent') Edit.indentMenu();
      else if (a === 'ro') Edit.toggleReadOnly();
      else if (a === 'problems') Tools.problems();
      else if (a === 'macro') Macro.toggle();
    });
  },
};
