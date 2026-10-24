'use strict';
/* Запуск: редактор, відновлення сесії, події від Android. */

(function boot() {
  K.info = Native.info();
  K.encodings = Native.encodings();
  Settings.load();
  Search.load();
  Macro.load();
  Recent.load();

  ace.config.set('basePath', 'ace/');
  ace.require('ace/ext/language_tools');

  K.ed = ace.edit('editor', {
    enableMobileMenu: false,
    animatedScroll: false,
    dragEnabled: false,
    copyWithEmptySelection: true,
    fadeFoldWidgets: false,
    navigateWithinSoftTabs: true,
    useSvgGutterIcons: true,
    cursorStyle: 'ace',
    mergeUndoDeltas: true,
    hasCssTransforms: true,
  });
  K.ed.renderer.setScrollMargin(6, 6, 0, 0);
  K.ed.renderer.setPadding(6);
  K.ed.textInput.getElement().setAttribute('autocapitalize', 'off');
  Settings.apply();

  // ---- шапка
  const top = (id, icon, run, long) => {
    const b = $(id);
    b.innerHTML = ic(icon);
    b.addEventListener('click', e => { if (b._long) { b._long = false; return; } run(e); });
    b.addEventListener('pointerdown', e => e.preventDefault());
    if (long) {
      let t = 0;
      b.addEventListener('pointerdown', () => { t = setTimeout(() => { b._long = true; long(); }, 480); });
      b.addEventListener('pointerup', () => clearTimeout(t));
      b.addEventListener('pointercancel', () => clearTimeout(t));
      b.addEventListener('contextmenu', e => e.preventDefault());
      b.addEventListener('touchend', e => { if (b._long && e.cancelable) { e.preventDefault(); b._long = false; } }, { passive: false });
    }
  };
  top('#bDrawer', 'panel', () => Drawer.toggle());
  top('#bRun', 'play', () => Tools.run());
  top('#bFind', 'search', () => (Search.isOpen ? Search.close() : Search.open(false)), () => Search.inFiles());
  top('#bSave', 'save', () => Tabs.save(), () => UI.menu([
    { icon: 'save', label: 'Зберегти як…', run: () => Tabs.saveAs() },
    { icon: 'saveAll', label: 'Зберегти всі', run: () => Tabs.saveAll() },
  ]));
  top('#bMenu', 'dots', () => Cmd.open(), () => Cmd.open(null, true));

  Tabs.bindStrip();
  Drawer.bind();
  Status.bind();
  Keys.build();
  Keys.bind();
  Sel.bind();
  Gestures.bind();
  Viewport.bind();
  Cmd.bindKeys();

  let statusRaf = 0;
  const statusSoon = () => { if (!statusRaf) statusRaf = requestAnimationFrame(() => { statusRaf = 0; Status.update(); }); };
  K.ed.on('changeSelection', statusSoon);
  K.ed.on('changeSession', statusSoon);
  K.ed.on('change', () => { if (Search.isOpen) { Search.liveStart = null; setTimeout(() => Search.count(), 0); } });

  // ---- сесія
  if (!Session.restore()) Tabs.newTab();
  if (K.wsRestore) {
    const w = K.wsRestore;
    delete K.wsRestore;
    const test = Native.list(w.tree, '');
    if (test.ok) Workspace.set(w.tree, w.name, w.open);
  }
  Drawer.render();

  // ---- події від Android
  const handleIntent = () => {
    const it = Native.intent();
    if (!it) return;
    if (it.type === 'files') {
      (async () => { for (const f of it.files) await Files.open(f.uri, { name: f.name }); })();
    } else if (it.type === 'text') {
      const t = Tabs.newTab(it.text, {});
      if (it.title) { t.name = it.title.slice(0, 40); Tabs.render(); }
    }
  };

  window.__kod = {
    onPick: (id, r) => Native.onPick(id, r),
    onFind: (id, d) => Native.onFind(id, d),
    onIntent: handleIntent,
    pause() {
      Session.flush();
      if (K.set.autosave === 'pause') for (const t of K.tabs) if (t.loaded && t.dirty && t.uri && !t.readOnly) Tabs.save(t, { quiet: true });
    },
    resume() {
      K.info = Native.info() || K.info;
      if (K.set.ui === 'system') Settings.apply();
      setTimeout(() => Tabs.checkExternal(), 150);
    },
    config(night) {
      K.info.night = night;
      if (K.set.ui === 'system') Settings.apply();
      K.ed.resize();
    },
    back() {
      if (UI.back()) return 'handled';
      if (Drawer.isOpen) { Drawer.close(); return 'handled'; }
      if (!$('#selbar').hidden) { Sel.hide(); K.ed.clearSelection(); return 'handled'; }
      if (Search.isOpen) { Search.close(); return 'handled'; }
      if (K.ed.inMultiSelectMode) { K.ed.exitMultiSelectMode(); return 'handled'; }
      Session.flush();
      return 'exit';
    },
  };
  handleIntent();

  window.addEventListener('pagehide', () => Session.flush());
  document.addEventListener('visibilitychange', () => { if (document.hidden) Session.flush(); });

  if (!Native.real) {
    fetch('js/hook.js').then(r => r.text()).then(t => { Tools.hookSource = t; });
    window.addEventListener('keydown', e => { if (e.key === 'Escape') window.__kod.back(); });
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => K.ed.renderer.updateFontSize());
  document.fonts && document.fonts.load('14px "JetBrains Mono"').then(() => K.ed.renderer.updateFontSize()).catch(() => {});

  // ---- перший запуск
  if (!Native.kvGet('seen', null)) {
    Native.kvPut('seen', { t: Date.now() });
    setTimeout(() => Welcome.show(), 400);
  }
})();

const Welcome = {
  show() {
    const body = h('div', { class: 'welcome' },
      h('div', { class: 'wlogo', html: ic('code') }),
      h('h2', { text: 'Код — редактор коду' }),
      h('p', { text: 'Підсвітка понад 150 мов, вкладки, пошук і заміна з регулярними виразами, кодування й кінці рядків, як у Notepad++.' }),
      h('ul', { class: 'wtips' },
        h('li', { html: ic('panel') + '<span><b>Файли й папка</b> — ліва кнопка вгорі: дерево проєкту, недавні файли.</span>' }),
        h('li', { html: ic('zap') + '<span><b>Рядок клавіш</b> над клавіатурою: Tab, стрілки, дужки. Кнопка ⚡ перемикає на дії з рядками.</span>' }),
        h('li', { html: ic('bookmark') + '<span><b>Закладка</b> — торкніться номера рядка. <b>Щипок</b> — змінити шрифт.</span>' }),
        h('li', { html: ic('play') + '<span><b>Запуск</b> HTML, JavaScript і Markdown — з консоллю.</span>' }),
        h('li', { html: ic('save') + '<span>Незбережене <b>не губиться</b>: зміни відновляться навіть після перезапуску.</span>' })),
      h('div', { class: 'wbtns' },
        h('button', { class: 'btn', text: 'Відкрити папку', onclick: () => { s.close(); Workspace.pick(); } }),
        h('button', { class: 'btn', text: 'Відкрити файл', onclick: () => { s.close(); Files.pickOpen(); } }),
        h('button', { class: 'btn primary', text: 'Почати', onclick: () => s.close() })));
    const s = UI.sheet({ body, cls: 'wsheet' });
  },
};
