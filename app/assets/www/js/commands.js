'use strict';
/* Команди: реєстр, головне меню за розділами, палітра команд, комбінації клавіш і макроси. */

const CATS = [
  ['file', 'Файл'], ['edit', 'Правка'], ['select', 'Виділення'], ['lines', 'Рядки'], ['search', 'Пошук'],
  ['view', 'Вигляд'], ['enc', 'Кодування'], ['lang', 'Синтаксис'], ['tools', 'Інструменти'], ['macro', 'Макроси'], ['app', 'Застосунок'],
];

const Cmd = {
  list: [],
  byId: {},
  cat: 'file',

  add(c) {
    Cmd.list.push(c);
    Cmd.byId[c.id] = c;
  },

  exec(id, args) {
    const c = Cmd.byId[id];
    if (!c || !K.cur) return;
    if (c.edit && K.ed.getReadOnly()) { UI.toast('Тільки читання — зніміть у меню вкладки'); return; }
    try {
      const r = c.run(args);
      if (r && r.catch) r.catch(e => UI.toast(String(e && e.message || e), { error: true }));
    } catch (e) {
      UI.toast(String(e && e.message || e), { error: true });
    }
    if ((typeof Status !== 'undefined')) setTimeout(Status.update, 0);
  },

  /** Команда Ace (записується в макрос). */
  ace(name, args) { return () => K.ed.execCommand(name, args); },

  // ---------------------------------------------------------------- головне меню

  open(cat, search) {
    if (cat) Cmd.cat = cat;
    const chips = h('div', { class: 'cats' });
    const input = h('input', { class: 'field', type: 'search', placeholder: 'Знайти команду…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const list = h('div', { class: 'mlist' });
    const head = h('div', { class: 'mhead2' }, input, chips);
    const s = UI.sheet({ body: list, head, full: true, cls: 'menu' });
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      list.innerHTML = '';
      chips.hidden = !!q;
      let items = Cmd.list.filter(c => !c.hidden && (!c.when || c.when()));
      if (q) items = items.filter(c => (c.title + ' ' + (c.keys || '') + ' ' + (c.alias || '') + ' ' + CATS.find(x => x[0] === c.cat)[1]).toLowerCase().includes(q));
      else items = items.filter(c => c.cat === Cmd.cat);
      let group = null;
      for (const c of items) {
        if (c.group && c.group !== group && !q) { list.appendChild(h('div', { class: 'mhead', text: c.group })); }
        group = c.group || group;
        const checked = c.check ? !!c.check() : null;
        list.appendChild(h('button', {
          class: 'mitem' + (checked ? ' checked' : '') + (c.danger ? ' danger' : ''),
          onclick: () => {
            if (c.keep) { Cmd.exec(c.id); draw(); return; }
            s.close();
            setTimeout(() => Cmd.exec(c.id), 30);
          },
        },
        h('span', { class: 'mic', html: c.icon ? ic(c.icon) : '<b class="glyph">' + esc(c.glyph || '') + '</b>' }),
        h('span', { class: 'mlabel' }, h('span', { text: c.title }), q ? h('small', { text: CATS.find(x => x[0] === c.cat)[1] }) : (c.sub ? h('small', { text: typeof c.sub === 'function' ? c.sub() : c.sub }) : null)),
        c.keys ? h('span', { class: 'mhint kbd', text: c.keys.replace(/-/g, '+') }) : null,
        checked != null ? h('span', { class: 'mcheck', html: checked ? ic('check') : '' }) : null));
      }
      if (!items.length) list.appendChild(h('div', { class: 'dempty', text: 'Нічого не знайдено' }));
    };
    for (const [id, name] of CATS) {
      chips.appendChild(h('button', {
        class: 'chip' + (id === Cmd.cat ? ' on' : ''), text: name, 'data-c': id,
        onclick: e => {
          Cmd.cat = id;
          for (const b of chips.children) b.classList.toggle('on', b === e.currentTarget);
          draw();
          list.scrollTop = 0;
        },
      }));
    }
    input.addEventListener('input', draw);
    draw();
    if (search) setTimeout(() => input.focus(), 100);
    setTimeout(() => { const on = chips.querySelector('.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' }); }, 50);
  },

  showShortcuts() {
    const body = h('div', { class: 'keys-help' });
    for (const [cat, name] of CATS) {
      const rows = Cmd.list.filter(c => c.cat === cat && c.keys);
      if (!rows.length) continue;
      body.appendChild(h('div', { class: 'sgroup', text: name }));
      const card = h('div', { class: 'scard' });
      for (const c of rows) card.appendChild(h('div', { class: 'srow' }, h('span', { class: 'slabel', text: c.title }), h('span', { class: 'kbd', text: c.keys.replace(/-/g, '+') })));
      body.appendChild(card);
    }
    body.appendChild(h('p', { class: 'dnote', text: 'Також працюють стандартні клавіші Ace: Alt+↑/↓ — перемістити рядок, Ctrl+Alt+↑/↓ — додати курсор, Ctrl+[ і Ctrl+] — відступ, Alt+клацання мишею — блочне виділення.' }));
    UI.page({ title: 'Комбінації клавіш', body, cls: 'settings' });
  },

  /** Прив'язати комбінації до редактора (для фізичної клавіатури). */
  bindKeys() {
    const cm = K.ed.commands;
    for (const k of ['Ctrl-D', 'Ctrl-L', 'Ctrl-F', 'Ctrl-H', 'Ctrl-K', 'Ctrl-Shift-K', 'Ctrl-,', 'Ctrl-Alt-E', 'Ctrl-Shift-E', 'Ctrl-P',
      'Ctrl-Shift-P', 'Ctrl-U', 'Ctrl-Shift-U', 'F2', 'Ctrl-Alt-S', 'F1', 'Ctrl-Shift-L', 'Ctrl-Q', 'Ctrl-J', 'Ctrl-B', 'Ctrl-G', 'Ctrl-W', 'Ctrl-N', 'Ctrl-O', 'Ctrl-S', 'F3', 'Shift-F3', 'Ctrl-F3']) cm.bindKey(k, null);
    for (const c of Cmd.list) {
      if (!c.keys) continue;
      cm.addCommand({
        name: 'kod.' + c.id,
        bindKey: { win: c.keys, mac: c.keys.replace(/Ctrl/g, 'Command') },
        exec: () => Cmd.exec(c.id),
        readOnly: !c.edit,
      });
    }
    // Комбінації, що мають працювати поза редактором (у полях пошуку тощо)
    document.addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('.ace_editor')) return;
      const key = (e.ctrlKey ? 'Ctrl-' : '') + (e.altKey ? 'Alt-' : '') + (e.shiftKey ? 'Shift-' : '') + (e.key.length === 1 ? e.key.toUpperCase() : e.key);
      const c = Cmd.list.find(x => x.keys === key && x.global);
      if (c) { e.preventDefault(); Cmd.exec(c.id); }
    });
  },
};

// ==================================================================== макроси

const Macro = {
  recording: false,
  steps: [],
  last: null,
  saved: {},
  SKIP: new Set(['kod.macroRec', 'kod.macroPlay', 'kod.menu', 'kod.palette', 'togglerecording', 'replaymacro']),

  load() {
    Macro.saved = Native.kvGet('macros', {}) || {};
    Macro.last = Native.kvGet('macroLast', null);
  },

  onExec(e) {
    if (!Macro.recording || Macro.playing) return;
    const name = e.command && e.command.name;
    if (!name || Macro.SKIP.has(name)) return;
    const c = name.startsWith('kod.') ? Cmd.byId[name.slice(4)] : null;
    if (c && c.macro === false) return;
    Macro.steps.push([name, e.args == null ? null : e.args]);
  },

  /** Ввімкнути запис або зупинити його. */
  toggle() {
    if (!Macro.recording) {
      Macro.steps = [];
      Macro.recording = true;
      K.ed.commands.on('afterExec', Macro.onExec);
      document.body.classList.add('recording');
      UI.toast('Запис макросу: введіть текст або виконайте команди, потім натисніть ● ще раз');
    } else {
      Macro.recording = false;
      K.ed.commands.off('afterExec', Macro.onExec);
      document.body.classList.remove('recording');
      if (Macro.steps.length) {
        Macro.last = Macro.steps.slice();
        Native.kvPut('macroLast', Macro.last);
        UI.toast('Макрос записано: ' + Macro.last.length + ' ' + plural(Macro.last.length, 'крок', 'кроки', 'кроків'), { action: { label: 'Зберегти', run: () => Macro.saveAs() } });
      } else UI.toast('Макрос порожній');
    }
    Status.update();
    if ((typeof Keys !== 'undefined')) Keys.build();
  },

  run(steps) {
    Macro.playing = true;
    try {
      for (const [name, args] of steps) K.ed.execCommand(name, args);
    } finally {
      Macro.playing = false;
    }
  },

  play(times = 1, steps) {
    steps = steps || Macro.last;
    if (Macro.recording) Macro.toggle();
    if (!steps || !steps.length) { UI.toast('Спершу запишіть макрос'); return; }
    if (K.ed.getReadOnly()) { UI.toast('Тільки читання'); return; }
    for (let i = 0; i < times; i++) Macro.run(steps);
  },

  /** Відтворювати, доки курсор рухається вниз і не дійде до кінця файлу. */
  playToEnd(steps) {
    steps = steps || Macro.last;
    if (!steps || !steps.length) { UI.toast('Спершу запишіть макрос'); return; }
    const s = K.cur.session;
    let n = 0, row = K.ed.getCursorPosition().row;
    while (n < 100000) {
      Macro.run(steps);
      n++;
      const r = K.ed.getCursorPosition().row;
      if (r <= row || r >= s.getLength() - 1) break;
      row = r;
    }
    UI.toast('Відтворено ' + n + ' ' + plural(n, 'раз', 'рази', 'разів'));
  },

  async playTimes() {
    const v = await UI.prompt('Відтворити кілька разів', '10', { inputmode: 'numeric', ok: 'Відтворити' });
    const n = parseInt(v, 10);
    if (n > 0) Macro.play(Math.min(n, 100000));
  },

  async saveAs() {
    if (!Macro.last) { UI.toast('Немає записаного макросу'); return; }
    const name = await UI.prompt('Назва макросу', 'Макрос ' + (Object.keys(Macro.saved).length + 1), { ok: 'Зберегти' });
    if (!name) return;
    Macro.saved[name.trim()] = Macro.last;
    Native.kvPut('macros', Macro.saved);
    UI.toast('Макрос «' + name.trim() + '» збережено');
  },

  async manage() {
    const names = Object.keys(Macro.saved);
    if (!names.length) { UI.toast('Збережених макросів немає'); return; }
    const name = await UI.choose('Збережені макроси', names.map(n => ({ value: n, icon: 'play', label: n, hint: Macro.saved[n].length + ' кр.' })));
    if (!name) return;
    UI.menu([
      { icon: 'play', label: 'Відтворити', run: () => Macro.play(1, Macro.saved[name]) },
      { icon: 'arrowDown', label: 'Відтворити до кінця файлу', run: () => Macro.playToEnd(Macro.saved[name]) },
      { icon: 'zap', label: 'Зробити поточним', run: () => { Macro.last = Macro.saved[name]; Native.kvPut('macroLast', Macro.last); UI.toast('Поточний макрос: ' + name); } },
      { icon: 'trash', label: 'Видалити', danger: true, run: () => { delete Macro.saved[name]; Native.kvPut('macros', Macro.saved); } },
    ], name);
  },
};

// ==================================================================== перелік команд

(function registerCommands() {
  const A = Cmd.ace;
  const set = (k) => () => Settings.set(k, !K.set[k]);
  const on = k => () => K.set[k];
  const add = (cat, list) => list.forEach(c => Cmd.add(Object.assign({ cat }, c)));

  add('file', [
    { id: 'new', title: 'Новий файл', icon: 'filePlus', keys: 'Ctrl-N', global: true, macro: false, run: () => Tabs.newTab() },
    { id: 'open', title: 'Відкрити файл…', icon: 'file', keys: 'Ctrl-O', global: true, macro: false, run: () => Files.pickOpen() },
    { id: 'openFolder', title: 'Відкрити папку…', icon: 'folderOpen', macro: false, run: () => Workspace.pick() },
    { id: 'files', title: 'Файли й недавні', icon: 'panel', keys: 'Ctrl-E', global: true, macro: false, run: () => Drawer.open() },
    { id: 'save', title: 'Зберегти', icon: 'save', keys: 'Ctrl-S', global: true, macro: false, run: () => Tabs.save() },
    { id: 'saveAs', title: 'Зберегти як…', icon: 'save', keys: 'Ctrl-Alt-S', macro: false, run: () => Tabs.saveAs() },
    { id: 'saveAll', title: 'Зберегти всі', icon: 'saveAll', keys: 'Ctrl-Shift-S', global: true, macro: false, run: () => Tabs.saveAll() },
    { id: 'reload', title: 'Перечитати з диска', icon: 'refresh', macro: false, when: () => K.cur && K.cur.uri, run: () => Tabs.reload() },
    { id: 'rename', title: 'Перейменувати…', icon: 'pencil', macro: false, when: () => K.cur && (K.cur.tree || K.cur.untitled), run: () => Files.renameTab(K.cur) },
    { id: 'close', title: 'Закрити вкладку', icon: 'x', keys: 'Ctrl-W', global: true, macro: false, run: () => Tabs.close() },
    { id: 'closeOthers', title: 'Закрити інші вкладки', icon: 'x', macro: false, run: () => Tabs.closeMany(K.tabs.filter(t => t !== K.cur)) },
    { id: 'closeAll', title: 'Закрити всі вкладки', icon: 'x', keys: 'Ctrl-Shift-W', macro: false, run: () => Tabs.closeMany(K.tabs.slice()) },
    { id: 'nextTab', title: 'Наступна вкладка', icon: 'right', keys: 'Ctrl-Tab', global: true, macro: false, run: () => Tabs.cycle(1) },
    { id: 'prevTab', title: 'Попередня вкладка', icon: 'left', keys: 'Ctrl-Shift-Tab', global: true, macro: false, run: () => Tabs.cycle(-1) },
    { id: 'share', title: 'Поділитися файлом', icon: 'share', macro: false, run: () => Native.share(K.ed.getValue(), K.cur.untitled ? K.cur.name + '.' + Langs.extFor(K.cur.mode) : K.cur.name) },
    { id: 'openWith', title: 'Відкрити в іншому застосунку', icon: 'external', macro: false, when: () => K.cur && K.cur.uri, run: () => Native.view(K.cur.uri, Files.mime(K.cur.name)) },
    { id: 'print', title: 'Друк або PDF…', icon: 'printer', keys: 'Ctrl-P', macro: false, run: () => Tools.print() },
  ]);

  add('edit', [
    { id: 'undo', title: 'Скасувати', icon: 'undo', keys: null, edit: true, run: A('undo'), sub: 'Ctrl+Z' },
    { id: 'redo', title: 'Повторити', icon: 'redo', edit: true, run: A('redo'), sub: 'Ctrl+Y' },
    { id: 'cut', title: 'Вирізати', icon: 'cut', edit: true, run: () => Edit.cut() },
    { id: 'copy', title: 'Копіювати', icon: 'copy', run: () => Edit.copy() },
    { id: 'paste', title: 'Вставити', icon: 'paste', edit: true, run: () => Edit.paste() },
    { id: 'duplicate', title: 'Дублювати рядок або виділене', icon: 'copy', keys: 'Ctrl-D', edit: true, run: A('duplicateSelection') },
    { id: 'deleteLine', title: 'Видалити рядок', icon: 'trash', keys: 'Ctrl-L', edit: true, run: A('removeline') },
    { id: 'moveUp', title: 'Перемістити рядок вгору', icon: 'arrowUp', keys: 'Ctrl-Shift-Up', edit: true, run: A('movelinesup') },
    { id: 'moveDown', title: 'Перемістити рядок вниз', icon: 'arrowDown', keys: 'Ctrl-Shift-Down', edit: true, run: A('movelinesdown') },
    { id: 'comment', title: 'Коментар рядка', glyph: '//', keys: 'Ctrl-Q', edit: true, run: A('togglecomment'), alias: 'закоментувати розкоментувати' },
    { id: 'blockComment', title: 'Блочний коментар', glyph: '/*', keys: 'Ctrl-Shift-Q', edit: true, run: A('toggleBlockComment') },
    { id: 'indent', title: 'Збільшити відступ', icon: 'indent', edit: true, run: A('blockindent') },
    { id: 'outdent', title: 'Зменшити відступ', icon: 'outdent', edit: true, run: A('blockoutdent') },
    { group: 'Регістр', id: 'upper', title: 'ВЕРХНІЙ РЕГІСТР', glyph: 'AB', keys: 'Ctrl-Shift-U', edit: true, run: A('touppercase') },
    { group: 'Регістр', id: 'lower', title: 'нижній регістр', glyph: 'ab', keys: 'Ctrl-U', edit: true, run: A('tolowercase') },
    { group: 'Регістр', id: 'title', title: 'Кожне Слово З Великої', glyph: 'Ab', edit: true, run: () => Edit.mapText(Edit.titleCase) },
    { group: 'Регістр', id: 'sentence', title: 'Речення з великої', glyph: 'A.', edit: true, run: () => Edit.mapText(Edit.sentenceCase) },
    { group: 'Регістр', id: 'invert', title: 'іНВЕРТУВАТИ рЕГІСТР', glyph: 'aB', edit: true, run: () => Edit.mapText(Edit.invertCase) },
    { group: 'Вставити', id: 'dateIso', title: 'Дату (2026-10-24)', icon: 'calendar', edit: true, run: () => Edit.insertDate('iso') },
    { group: 'Вставити', id: 'dateTime', title: 'Дату й час', icon: 'clock', edit: true, run: () => Edit.insertDate('isoTime') },
    { group: 'Вставити', id: 'dateUk', title: 'Дату (24.10.2026)', icon: 'calendar', edit: true, run: () => Edit.insertDate('uk') },
    { group: 'Вставити', id: 'dateLong', title: 'Дату словами', icon: 'calendar', edit: true, run: () => Edit.insertDate('long') },
    { group: 'Вставити', id: 'unixTime', title: 'Unix-час', icon: 'hash', edit: true, run: () => Edit.insertDate('stamp') },
    { group: 'Файл', id: 'readOnly', title: 'Тільки читання', icon: 'lock', macro: false, check: () => K.cur && K.cur.readOnly, run: () => Edit.toggleReadOnly() },
  ]);

  add('select', [
    { id: 'selectAll', title: 'Виділити все', icon: 'select', keys: null, run: A('selectall'), sub: 'Ctrl+A' },
    { id: 'selectLine', title: 'Виділити рядок', icon: 'select', keys: 'Ctrl-Shift-L', run: A('expandtoline') },
    { id: 'selectWord', title: 'Виділити слово', icon: 'select', run: () => K.ed.selection.selectWord() },
    { id: 'selectBrackets', title: 'Виділити до парної дужки', glyph: '{}', keys: 'Ctrl-Shift-B', run: A('selecttomatching') },
    { id: 'gotoMatching', title: 'Перейти до парної дужки', glyph: '{|', keys: 'Ctrl-B', run: A('jumptomatching') },
    { group: 'Кілька курсорів', id: 'selectNext', title: 'Додати наступне таке саме', icon: 'cursors', keys: 'Ctrl-Alt-D', run: A('selectMoreAfter') },
    { group: 'Кілька курсорів', id: 'selectAllOcc', title: 'Виділити всі такі самі', icon: 'cursors', keys: 'Ctrl-Shift-D', run: () => Tools.selectAllOccurrences() },
    { group: 'Кілька курсорів', id: 'cursorAbove', title: 'Додати курсор вище', icon: 'arrowUp', run: A('addCursorAbove') },
    { group: 'Кілька курсорів', id: 'cursorBelow', title: 'Додати курсор нижче', icon: 'arrowDown', run: A('addCursorBelow') },
    { group: 'Кілька курсорів', id: 'block', title: 'Блочне виділення', icon: 'columns', sub: 'Прямокутник із поточного виділення', run: () => Edit.blockSelect() },
    { group: 'Кілька курсорів', id: 'lineEnds', title: 'Курсор у кінець кожного рядка', icon: 'cursors', run: () => Edit.cursorsAtLineEnds() },
    { group: 'Кілька курсорів', id: 'sequence', title: 'Вставити послідовність чисел', glyph: '1₂', edit: true, sub: 'У кожен курсор: 1, 2, 3…', run: () => Edit.insertSequence() },
    { group: 'Кілька курсорів', id: 'singleCursor', title: 'Лишити один курсор', icon: 'x', run: () => K.ed.exitMultiSelectMode && K.ed.exitMultiSelectMode() },
  ]);

  add('lines', [
    { group: 'Сортування', id: 'sortAsc', title: 'Сортувати А → Я', icon: 'sort', edit: true, run: () => Edit.sort('asc') },
    { group: 'Сортування', id: 'sortDesc', title: 'Сортувати Я → А', icon: 'sort', edit: true, run: () => Edit.sort('desc') },
    { group: 'Сортування', id: 'sortCi', title: 'Сортувати без урахування регістру', icon: 'sort', edit: true, run: () => Edit.sort('ci') },
    { group: 'Сортування', id: 'sortNum', title: 'Сортувати як числа', icon: 'sort', edit: true, run: () => Edit.sort('num') },
    { group: 'Сортування', id: 'sortLen', title: 'Сортувати за довжиною', icon: 'sort', edit: true, run: () => Edit.sort('len') },
    { group: 'Сортування', id: 'reverse', title: 'Обернути порядок рядків', icon: 'swap', edit: true, run: () => Edit.reverseLines() },
    { group: 'Чистка', id: 'dedupe', title: 'Видалити дублікати рядків', icon: 'layers', edit: true, run: () => Edit.dedupe(false) },
    { group: 'Чистка', id: 'dedupeAdj', title: 'Видалити сусідні дублікати', icon: 'layers', edit: true, run: () => Edit.dedupe(true) },
    { group: 'Чистка', id: 'removeEmpty', title: 'Видалити порожні рядки', icon: 'trash', edit: true, run: () => Edit.removeEmpty(false) },
    { group: 'Чистка', id: 'removeBlank', title: 'Видалити рядки з пробілів', icon: 'trash', edit: true, run: () => Edit.removeEmpty(true) },
    { group: 'Пробіли', id: 'trimEnd', title: 'Прибрати пробіли в кінці', glyph: '␣⇥', edit: true, run: () => Edit.trim('end') },
    { group: 'Пробіли', id: 'trimStart', title: 'Прибрати пробіли на початку', glyph: '⇤␣', edit: true, run: () => Edit.trim('start') },
    { group: 'Пробіли', id: 'trimBoth', title: 'Прибрати пробіли з обох боків', glyph: '␣␣', edit: true, run: () => Edit.trim('both') },
    { group: 'Пробіли', id: 'tabsToSpaces', title: 'Табуляції → пробіли', glyph: '⇥→␣', edit: true, run: () => Edit.tabsToSpaces() },
    { group: 'Пробіли', id: 'spacesToTabs', title: 'Пробіли на початку → табуляції', glyph: '␣→⇥', edit: true, run: () => Edit.leadingSpacesToTabs() },
    { group: 'Інше', id: 'join', title: 'Об’єднати рядки', icon: 'wrap', keys: 'Ctrl-J', edit: true, run: () => Edit.joinLines() },
    { group: 'Інше', id: 'splitLines', title: 'Розбити за межею рядка', icon: 'wrap', edit: true, sub: () => 'Перенести слова на ' + K.set.marginCol + '-й колонці', run: () => Tools.hardWrap() },
  ]);

  add('search', [
    { id: 'find', title: 'Знайти', icon: 'search', keys: 'Ctrl-F', global: true, macro: false, run: () => Search.open(false) },
    { id: 'replace', title: 'Замінити', icon: 'replace', keys: 'Ctrl-H', global: true, macro: false, run: () => Search.open(true) },
    { id: 'findNext', title: 'Знайти наступне', icon: 'down', keys: 'F3', global: true, run: () => Search.next(false) },
    { id: 'findPrev', title: 'Знайти попереднє', icon: 'up', keys: 'Shift-F3', global: true, run: () => Search.next(true) },
    { id: 'findSel', title: 'Знайти виділене слово', icon: 'search', keys: 'Ctrl-F3', run: () => Search.quick(false) },
    { id: 'findFiles', title: 'Знайти в папці або вкладках…', icon: 'folder', keys: 'Ctrl-Shift-F', global: true, macro: false, run: () => Search.inFiles() },
    { id: 'goto', title: 'Перейти до рядка…', icon: 'target', keys: 'Ctrl-G', macro: false, run: () => Search.gotoLine() },
    { id: 'outline', title: 'Список функцій', icon: 'list', keys: 'Ctrl-Shift-O', macro: false, run: () => Tools.outline() },
    { id: 'problems', title: 'Помилки й попередження', icon: 'alert', macro: false, run: () => Tools.problems() },
    { group: 'Закладки', id: 'bmToggle', title: 'Поставити / зняти закладку', icon: 'bookmark', keys: 'Ctrl-F2', run: () => Edit.toggleBookmark() },
    { group: 'Закладки', id: 'bmNext', title: 'Наступна закладка', icon: 'down', keys: 'F2', run: () => Edit.nextBookmark(false) },
    { group: 'Закладки', id: 'bmPrev', title: 'Попередня закладка', icon: 'up', keys: 'Shift-F2', run: () => Edit.nextBookmark(true) },
    { group: 'Закладки', id: 'bmList', title: 'Усі закладки…', icon: 'list', macro: false, run: () => Edit.listBookmarks() },
    { group: 'Закладки', id: 'bmCopy', title: 'Копіювати рядки із закладками', icon: 'copy', run: () => Edit.copyBookmarked(false) },
    { group: 'Закладки', id: 'bmCut', title: 'Вирізати рядки із закладками', icon: 'cut', edit: true, run: () => Edit.copyBookmarked(true) },
    { group: 'Закладки', id: 'bmDelete', title: 'Видалити рядки із закладками', icon: 'trash', edit: true, run: () => Edit.deleteBookmarked() },
    { group: 'Закладки', id: 'bmClear', title: 'Зняти всі закладки', icon: 'x', run: () => Edit.clearBookmarks() },
  ]);

  add('view', [
    { id: 'wrap', title: 'Перенесення рядків', icon: 'wrap', keys: 'Alt-Z', keep: true, macro: false, check: on('wrap'), run: set('wrap') },
    { id: 'invisibles', title: 'Показати всі символи', glyph: '¶', keep: true, macro: false, check: on('invisibles'), run: set('invisibles') },
    { id: 'lineNumbers', title: 'Номери рядків', glyph: '12', keep: true, macro: false, check: on('lineNumbers'), run: set('lineNumbers') },
    { id: 'guides', title: 'Напрямні відступів', glyph: '┆', keep: true, macro: false, check: on('indentGuides'), run: set('indentGuides') },
    { id: 'smart', title: 'Підсвічувати таке саме слово', glyph: 'ab', keep: true, macro: false, check: on('smartHighlight'), run: set('smartHighlight') },
    { id: 'keysBar', title: 'Рядок додаткових клавіш', icon: 'keyboard', keep: true, macro: false, check: on('keysBar'), run: set('keysBar') },
    { group: 'Згортання', id: 'foldAll', title: 'Згорнути все', icon: 'fold', keys: 'Alt-0', run: A('foldall') },
    { group: 'Згортання', id: 'unfoldAll', title: 'Розгорнути все', icon: 'unfold', keys: 'Alt-Shift-0', run: A('unfoldall') },
    { group: 'Згортання', id: 'foldOther', title: 'Згорнути все, крім поточного', icon: 'fold', run: A('foldOther') },
    { group: 'Згортання', id: 'toggleFold', title: 'Згорнути / розгорнути блок', icon: 'unfold', keys: 'Ctrl-Alt-F', run: A('toggleFoldWidget') },
    { group: 'Масштаб', id: 'zoomIn', title: 'Збільшити шрифт', icon: 'zoomIn', keys: 'Ctrl-=', keep: true, macro: false, sub: () => K.set.fontSize + ' px', run: () => Settings.set('fontSize', Math.min(40, K.set.fontSize + 1)) },
    { group: 'Масштаб', id: 'zoomOut', title: 'Зменшити шрифт', icon: 'zoomOut', keys: 'Ctrl--', keep: true, macro: false, run: () => Settings.set('fontSize', Math.max(8, K.set.fontSize - 1)) },
    { group: 'Масштаб', id: 'zoomReset', title: 'Звичайний розмір', icon: 'search', keys: 'Ctrl-0', macro: false, run: () => Settings.set('fontSize', DEFAULTS.fontSize) },
    { group: 'Тема', id: 'darkMode', title: 'Темна тема', icon: 'moon', keep: true, macro: false, check: () => Settings.isDark(), run: () => Settings.set('ui', Settings.isDark() ? 'light' : 'dark') },
    { group: 'Тема', id: 'codeTheme', title: 'Тема коду…', icon: 'eye', macro: false, sub: () => (THEMES.find(t => t[0] === (Settings.isDark() ? K.set.themeDark : K.set.themeLight)) || [0, ''])[1], run: () => Tools.pickTheme() },
  ]);

  add('enc', [
    { id: 'encMenu', title: 'Кодування…', icon: 'enc', macro: false, sub: () => K.cur ? K.cur.encLabel : '', run: () => Edit.encodingMenu() },
    { id: 'convertEnc', title: 'Перетворити на…', icon: 'enc', macro: false, run: () => Edit.convertEncoding() },
    { id: 'reopenEnc', title: 'Перечитати в кодуванні…', icon: 'refresh', macro: false, when: () => K.cur && K.cur.uri, run: () => Edit.reopenEncoding() },
    { group: 'Швидко', id: 'toUtf8', title: 'Перетворити на UTF-8', glyph: 'U8', macro: false, check: () => K.cur && K.cur.enc === 'utf-8' && !K.cur.bom, run: () => { const t = K.cur; t.enc = 'utf-8'; t.bom = false; t.forceDirty = true; Tabs.render(); Tabs.refreshChrome(); } },
    { group: 'Швидко', id: 'toUtf8Bom', title: 'Перетворити на UTF-8 з BOM', glyph: 'U8', macro: false, check: () => K.cur && K.cur.enc === 'utf-8' && K.cur.bom, run: () => { const t = K.cur; t.enc = 'utf-8'; t.bom = true; t.forceDirty = true; Tabs.render(); Tabs.refreshChrome(); } },
    { group: 'Кінці рядків', id: 'eol', title: 'Кінці рядків…', icon: 'eol', macro: false, sub: () => K.cur ? K.cur.eol : '', run: () => Edit.eolMenu() },
    { group: 'Кінці рядків', id: 'eolWin', title: 'Windows (CR LF)', glyph: '↵', macro: false, check: () => K.cur && K.cur.eol === 'CRLF', run: () => { K.cur.eol = 'CRLF'; K.cur.forceDirty = true; Tabs.render(); Tabs.refreshChrome(); } },
    { group: 'Кінці рядків', id: 'eolUnix', title: 'Unix (LF)', glyph: '↵', macro: false, check: () => K.cur && K.cur.eol === 'LF', run: () => { K.cur.eol = 'LF'; K.cur.forceDirty = true; Tabs.render(); Tabs.refreshChrome(); } },
    { group: 'Відступи', id: 'indentMenu', title: 'Відступи…', icon: 'indent', macro: false, sub: () => K.cur ? (K.cur.session.getUseSoftTabs() ? 'Пробіли ' : 'Табуляція ') + K.cur.session.getTabSize() : '', run: () => Edit.indentMenu() },
  ]);

  add('lang', [
    { id: 'language', title: 'Вибрати мову…', icon: 'code', macro: false, sub: () => K.cur ? Langs.caption(K.cur.mode) : '', run: () => Edit.setLanguage() },
  ].concat(['text', 'html', 'css', 'javascript', 'typescript', 'json', 'markdown', 'python', 'java', 'kotlin', 'c_cpp', 'csharp', 'php', 'sh', 'sql', 'xml', 'yaml', 'golang', 'rust', 'lua', 'ruby', 'ini', 'batchfile', 'powershell', 'dockerfile'].map(m => ({
    group: 'Популярні', id: 'lang_' + m, title: Langs.caption(m), glyph: Langs.badge('a.' + Langs.extFor(m))[0], macro: false,
    check: () => K.cur && K.cur.mode === m, run: () => Tabs.setMode(K.cur, m),
  }))));

  add('tools', [
    { id: 'run', title: 'Запустити', icon: 'play', keys: 'F5', global: true, macro: false, sub: 'HTML, JavaScript, Markdown', run: () => Tools.run() },
    { id: 'console', title: 'Консоль JavaScript', icon: 'terminal', macro: false, run: () => Tools.repl() },
    { id: 'format', title: 'Форматувати код', icon: 'wand', keys: 'Shift-Alt-F', edit: true, sub: 'HTML, CSS, JS, JSON', run: () => Tools.format() },
    { id: 'compare', title: 'Порівняти з…', icon: 'columns', macro: false, sub: 'Інша вкладка або збережена версія', run: () => Tools.compare(K.cur) },
    { id: 'stats', title: 'Статистика', icon: 'chart', macro: false, run: () => Edit.stats() },
    { group: 'JSON', id: 'jsonPretty', title: 'JSON: красиво', glyph: '{ }', edit: true, run: () => Tools.json('pretty') },
    { group: 'JSON', id: 'jsonMin', title: 'JSON: в один рядок', glyph: '{}', edit: true, run: () => Tools.json('min') },
    { group: 'JSON', id: 'jsonCheck', title: 'JSON: перевірити', glyph: '✓', macro: false, run: () => Tools.json('check') },
    { group: 'JSON', id: 'jsonSort', title: 'JSON: сортувати ключі', glyph: 'az', edit: true, run: () => Tools.json('sort') },
    { group: 'Перетворення виділеного', id: 'b64enc', title: 'Base64: закодувати', glyph: 'b64', edit: true, run: () => Tools.convert('b64enc') },
    { group: 'Перетворення виділеного', id: 'b64dec', title: 'Base64: розкодувати', glyph: 'b64', edit: true, run: () => Tools.convert('b64dec') },
    { group: 'Перетворення виділеного', id: 'urlenc', title: 'URL: закодувати', glyph: '%', edit: true, run: () => Tools.convert('urlenc') },
    { group: 'Перетворення виділеного', id: 'urldec', title: 'URL: розкодувати', glyph: '%', edit: true, run: () => Tools.convert('urldec') },
    { group: 'Перетворення виділеного', id: 'htmlenc', title: 'HTML: екранувати &<>', glyph: '&lt;', edit: true, run: () => Tools.convert('htmlenc') },
    { group: 'Перетворення виділеного', id: 'htmldec', title: 'HTML: розекранувати', glyph: '&', edit: true, run: () => Tools.convert('htmldec') },
    { group: 'Перетворення виділеного', id: 'strenc', title: 'Рядок JS/JSON: екранувати', glyph: '\\"', edit: true, run: () => Tools.convert('strenc') },
    { group: 'Перетворення виділеного', id: 'strdec', title: 'Рядок JS/JSON: розекранувати', glyph: '"', edit: true, run: () => Tools.convert('strdec') },
    { group: 'Перетворення виділеного', id: 'translit', title: 'Транслітерація (кирилиця → латиниця)', glyph: 'Їi', edit: true, run: () => Tools.convert('translit') },
    { group: 'Хеші', id: 'md5', title: 'MD5', icon: 'hash', macro: false, run: () => Tools.hash('MD5') },
    { group: 'Хеші', id: 'sha1', title: 'SHA-1', icon: 'hash', macro: false, run: () => Tools.hash('SHA-1') },
    { group: 'Хеші', id: 'sha256', title: 'SHA-256', icon: 'hash', macro: false, run: () => Tools.hash('SHA-256') },
    { group: 'Хеші', id: 'sha512', title: 'SHA-512', icon: 'hash', macro: false, run: () => Tools.hash('SHA-512') },
  ]);

  add('macro', [
    { id: 'macroRec', title: 'Почати / зупинити запис', icon: 'record', keys: 'Ctrl-Shift-R', macro: false, check: () => Macro.recording, run: () => Macro.toggle() },
    { id: 'macroPlay', title: 'Відтворити', icon: 'play', keys: 'Ctrl-Shift-P', macro: false, sub: () => Macro.last ? Macro.last.length + ' ' + plural(Macro.last.length, 'крок', 'кроки', 'кроків') : 'ще не записано', run: () => Macro.play(1) },
    { id: 'macroTimes', title: 'Відтворити кілька разів…', icon: 'refresh', macro: false, run: () => Macro.playTimes() },
    { id: 'macroEnd', title: 'Відтворювати до кінця файлу', icon: 'arrowDown', macro: false, run: () => Macro.playToEnd() },
    { id: 'macroSave', title: 'Зберегти поточний макрос…', icon: 'save', macro: false, run: () => Macro.saveAs() },
    { id: 'macroList', title: 'Збережені макроси…', icon: 'list', macro: false, sub: () => Object.keys(Macro.saved).length + ' шт.', run: () => Macro.manage() },
  ]);

  add('app', [
    { id: 'settings', title: 'Налаштування', icon: 'sliders', keys: 'Ctrl-,', global: true, macro: false, run: () => Settings.open() },
    { id: 'palette', title: 'Палітра команд', icon: 'search', keys: 'F1', global: true, macro: false, run: () => Cmd.open(null, true) },
    { id: 'shortcuts', title: 'Комбінації клавіш', icon: 'keyboard', macro: false, run: () => Cmd.showShortcuts() },
    { id: 'menu', title: 'Меню', icon: 'dots', hidden: true, macro: false, run: () => Cmd.open() },
    { id: 'exit', title: 'Вийти', icon: 'x', macro: false, run: () => { Session.flush(); Native.exit(); } },
  ]);
})();
