'use strict';
/* Налаштування: значення за замовчуванням, збереження, застосування і сторінка налаштувань. */

/** Спільний стан застосунку. */
const K = { ed: null, tabs: [], cur: null, set: null, ws: null, info: {}, encodings: [] };

const DEFAULTS = {
  ui: 'system',              // system | dark | light
  themeDark: 'kod_dark',
  themeLight: 'kod_light',
  fontSize: 14,
  font: 'jb',                // jb — JetBrains Mono, sys — системний моноширинний
  lineHeight: 1.5,
  ligatures: false,
  wrap: false,
  lineNumbers: true,
  invisibles: false,
  indentGuides: true,
  activeLine: true,
  smartHighlight: true,
  folding: true,
  printMargin: false,
  marginCol: 80,
  scrollPastEnd: true,
  tabSize: 4,
  softTabs: true,
  detectIndent: true,
  autoPairs: true,
  autocomplete: true,
  snippets: true,
  lint: true,
  keysBar: true,
  keysSet: '{ } ( ) [ ] < > ; = " \' ` / \\ | & ! ? : , . - + * % # $ @ ^ ~ _',
  newEnc: 'utf-8',
  newEol: 'LF',
  restore: true,
  autosave: 'off',           // off | pause | change
  reloadSilently: true,
  findExclude: '.git node_modules __pycache__ .gradle .idea .venv venv',
  debug: false,
};

const Settings = {
  load() {
    const saved = Native.kvGet('settings', null) || {};
    K.set = Object.assign({}, DEFAULTS, saved);
  },

  save: debounce(() => Native.kvPut('settings', K.set), 300),

  set(key, value) {
    K.set[key] = value;
    Settings.save();
    Settings.apply();
  },

  isDark() {
    const ui = K.set.ui;
    if (ui === 'dark') return true;
    if (ui === 'light') return false;
    if (Native.real) return !!K.info.night;
    return matchMedia('(prefers-color-scheme: dark)').matches;
  },

  editorTheme() {
    return 'ace/theme/' + (Settings.isDark() ? K.set.themeDark : K.set.themeLight);
  },

  /** Опції, що належать сесії (кожній вкладці). */
  sessionOptions(tab) {
    const s = K.set;
    return {
      tabSize: tab && tab.tabSize ? tab.tabSize : s.tabSize,
      useSoftTabs: tab && tab.softTabs != null ? tab.softTabs : s.softTabs,
      wrap: s.wrap,
      foldStyle: s.folding ? 'markbegin' : 'manual',
      useWorker: s.lint && !(tab && tab.big),
    };
  },

  apply() {
    const s = K.set;
    const dark = Settings.isDark();
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
    document.documentElement.style.setProperty('--code-font', s.font === 'sys' ? 'monospace' : '"JetBrains Mono", monospace');
    const bar = getComputedStyle(document.documentElement).getPropertyValue('--bar').trim() || (dark ? '#1a1d23' : '#f4f5f8');
    Native.bars(bar, !dark);
    document.body.classList.toggle('nokeys', !s.keysBar);
    const ed = K.ed;
    if (!ed) return;
    ed.setOptions({
      theme: Settings.editorTheme(),
      fontSize: s.fontSize,
      fontFamily: s.font === 'sys' ? 'monospace' : '"JetBrains Mono", monospace',
      showLineNumbers: s.lineNumbers,
      showGutter: true,
      showInvisibles: s.invisibles,
      displayIndentGuides: s.indentGuides,
      highlightIndentGuides: s.indentGuides,
      highlightActiveLine: s.activeLine,
      highlightGutterLine: s.activeLine,
      highlightSelectedWord: s.smartHighlight,
      showFoldWidgets: s.folding,
      showPrintMargin: s.printMargin,
      printMarginColumn: s.marginCol,
      scrollPastEnd: s.scrollPastEnd ? 0.5 : 0,
      behavioursEnabled: s.autoPairs,
      wrapBehavioursEnabled: s.autoPairs,
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: s.autocomplete,
      enableSnippets: s.snippets,
    });
    ed.container.style.lineHeight = String(s.lineHeight);
    document.documentElement.classList.toggle('liga', !!s.ligatures);
    for (const t of K.tabs) if (t.session) t.session.setOptions(Settings.sessionOptions(t));
    ed.renderer.updateFontSize();
    if ((typeof Status !== 'undefined')) Status.update();
    if ((typeof Keys !== 'undefined')) Keys.build();
  },

  // ---------------------------------------------------------------- сторінка налаштувань

  open() {
    const p = UI.page({ title: 'Налаштування', cls: 'settings' });
    const body = p.body;
    const s = K.set;
    const sec = (title) => body.appendChild(h('div', { class: 'sgroup', text: title }));
    const card = () => body.appendChild(h('div', { class: 'scard' }));
    let c;

    const toggle = (key, label, sub, after) => {
      const sw = h('span', { class: 'switch' + (s[key] ? ' on' : '') });
      const row = h('button', {
        class: 'srow', onclick: () => {
          Settings.set(key, !K.set[key]);
          sw.classList.toggle('on', K.set[key]);
          if (after) after(K.set[key]);
        },
      }, h('span', { class: 'slabel' }, h('span', { text: label }), sub ? h('small', { text: sub }) : null), sw);
      c.appendChild(row);
    };
    const choice = (key, label, options, after) => {
      const val = h('span', { class: 'sval' });
      const show = () => { const o = options.find(o => o.value === K.set[key]); val.textContent = o ? o.label : K.set[key]; };
      show();
      c.appendChild(h('button', {
        class: 'srow', onclick: async () => {
          const v = await UI.choose(label, options.map(o => Object.assign({ checked: o.value === K.set[key] }, o)));
          if (v == null) return;
          Settings.set(key, v);
          show();
          if (after) after(v);
        },
      }, h('span', { class: 'slabel', text: label }), val, h('span', { class: 'chev', html: ic('right') })));
    };
    const stepper = (key, label, min, max, step, fmt) => {
      const val = h('span', { class: 'snum', text: (fmt || String)(s[key]) });
      const btn = (d, icon) => h('button', {
        class: 'ib sm', html: ic(icon), onclick: e => {
          e.stopPropagation();
          const v = Math.round(clamp(K.set[key] + d, min, max) * 100) / 100;
          Settings.set(key, v);
          val.textContent = (fmt || String)(v);
        },
      });
      c.appendChild(h('div', { class: 'srow' }, h('span', { class: 'slabel', text: label }),
        h('span', { class: 'stepper' }, btn(-step, 'minus'), val, btn(step, 'plus'))));
    };
    const action = (label, sub, run, danger) => {
      c.appendChild(h('button', { class: 'srow' + (danger ? ' danger' : ''), onclick: run },
        h('span', { class: 'slabel' }, h('span', { text: label }), sub ? h('small', { text: sub }) : null),
        h('span', { class: 'chev', html: ic('right') })));
    };

    sec('Вигляд');
    c = card();
    choice('ui', 'Тема інтерфейсу', [
      { value: 'system', label: 'Як у системі', icon: 'layers' },
      { value: 'dark', label: 'Темна', icon: 'moon' },
      { value: 'light', label: 'Світла', icon: 'sun' },
    ]);
    choice('themeDark', 'Тема коду (темна)', THEMES.filter(t => t[2]).map(t => ({ value: t[0], label: t[1] })));
    choice('themeLight', 'Тема коду (світла)', THEMES.filter(t => !t[2]).map(t => ({ value: t[0], label: t[1] })));
    choice('font', 'Шрифт', [
      { value: 'jb', label: 'JetBrains Mono' },
      { value: 'sys', label: 'Системний моноширинний' },
    ]);
    stepper('fontSize', 'Розмір шрифту', 8, 40, 1, v => v + ' px');
    stepper('lineHeight', 'Висота рядка', 1.1, 2.2, 0.1, v => v.toFixed(1).replace('.', ','));
    toggle('ligatures', 'Лігатури шрифту', 'Показувати => і === як суцільні знаки');

    sec('Редактор');
    c = card();
    toggle('wrap', 'Перенесення рядків', 'Довгі рядки переносяться за шириною екрана');
    toggle('lineNumbers', 'Номери рядків');
    toggle('folding', 'Згортання коду', 'Стрілки біля номерів рядків');
    toggle('activeLine', 'Підсвічувати поточний рядок');
    toggle('smartHighlight', 'Підсвічувати таке саме слово', 'Як «розумне підсвічування» в Notepad++');
    toggle('indentGuides', 'Напрямні відступів');
    toggle('invisibles', 'Показувати всі символи', 'Пробіли, табуляції й кінці рядків');
    toggle('printMargin', 'Межа рядка', 'Вертикальна лінія на ' + s.marginCol + '-й колонці');
    toggle('scrollPastEnd', 'Прокрутка за кінець файлу');

    sec('Набір');
    c = card();
    stepper('tabSize', 'Ширина табуляції', 1, 8, 1);
    toggle('softTabs', 'Пробіли замість табуляції');
    toggle('detectIndent', 'Визначати відступи файлу', 'Брати табуляцію чи пробіли з вмісту');
    toggle('autoPairs', 'Закривати дужки й лапки', 'Також теги в HTML');
    toggle('autocomplete', 'Підказки під час набору', 'Ключові слова, сніпети, слова з файлу');
    toggle('snippets', 'Сніпети', 'Наприклад, «fn» + Tab у JavaScript');
    toggle('lint', 'Перевірка помилок', 'JavaScript, CSS, HTML, JSON, PHP, XML, YAML, Lua');

    sec('Клавіатура');
    c = card();
    toggle('keysBar', 'Рядок додаткових клавіш', 'Tab, стрілки, дужки й символи над клавіатурою');
    action('Символи в рядку', s.keysSet.replace(/ /g, ' '), async () => {
      const v = await UI.prompt('Символи в рядку клавіш', K.set.keysSet, { note: 'Через пробіл. Можна кілька символів в одній клавіші, наприклад => або </' });
      if (v != null) Settings.set('keysSet', v.trim() || DEFAULTS.keysSet);
    });
    action('Комбінації клавіш', 'Для фізичної клавіатури, як у Notepad++', () => Cmd.showShortcuts());

    sec('Файли');
    c = card();
    choice('newEnc', 'Кодування нових файлів', [
      { value: 'utf-8', label: 'UTF-8' }, { value: 'utf-8-bom', label: 'UTF-8 з BOM' }, { value: 'windows-1251', label: 'Windows-1251' },
    ]);
    choice('newEol', 'Кінці рядків нових файлів', [
      { value: 'LF', label: 'Unix (LF)' }, { value: 'CRLF', label: 'Windows (CR LF)' },
    ]);
    toggle('restore', 'Відновлювати сесію', 'Відкриті вкладки й незбережені зміни після перезапуску');
    choice('autosave', 'Автозбереження на диск', [
      { value: 'off', label: 'Вимкнено', sub: 'Незбережене все одно зберігається в резервну копію' },
      { value: 'pause', label: 'Коли згортаю застосунок' },
      { value: 'change', label: 'Через 2 с після змін' },
    ]);
    toggle('reloadSilently', 'Оновлювати файли, змінені ззовні', 'Якщо у вкладці немає незбережених змін');

    sec('Для розробників');
    c = card();
    toggle('debug', 'Налагодження WebView', 'chrome://inspect на комп’ютері через USB', v => Native.debug(v));

    sec('Про застосунок');
    c = card();
    c.appendChild(h('div', { class: 'about' },
      h('div', { class: 'alogo', html: ic('code') }),
      h('div', null,
        h('b', { text: 'Код ' + (K.info.version || '') }),
        h('small', { text: 'Редактор коду для Android. Рушій Ace ' + ace.version + ', шрифт JetBrains Mono.' }))));
    action('Скинути налаштування', 'Повернути значення за замовчуванням', async () => {
      if (!await UI.confirm('Скинути налаштування?', 'Відкриті файли й сесія не зміняться.', 'Скинути', true)) return;
      K.set = Object.assign({}, DEFAULTS);
      Settings.save();
      Settings.apply();
      p.close();
      UI.toast('Налаштування скинуто');
    }, true);
    return p;
  },
};
