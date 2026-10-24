'use strict';
/* Рядок додаткових клавіш, панель дій над виділенням, масштаб щипком, закладки на полях. */

const Keys = {
  page: 'sym',
  shift: false,

  /** Натискання «справжньої» клавіші через обробники Ace (працює з підказками і сніпетами). */
  press(keyCode, shift) {
    const ed = K.ed;
    if (!ed) return;
    const fake = { preventDefault() {}, stopPropagation() {}, keyCode };
    ed.keyBinding.onCommandKey(fake, shift ? 4 : 0, keyCode);
    ed.renderer.scrollCursorIntoView();
  },

  insert(text) {
    if (K.ed.getReadOnly()) return;
    K.ed.commands.exec('insertstring', K.ed, text);
  },

  build() {
    const bar = $('#keys');
    if (!bar) return;
    bar.innerHTML = '';
    const mk = (cls, html, act, opts = {}) => {
      const b = h('button', { class: 'key ' + cls, html, 'aria-label': opts.label || null, 'data-repeat': opts.repeat ? '1' : null });
      b._act = act;
      return b;
    };
    const left = h('div', { class: 'kfix' },
      mk('kmode', ic(Keys.page === 'sym' ? 'zap' : 'keyboard'), () => { Keys.page = Keys.page === 'sym' ? 'act' : 'sym'; Keys.build(); }, { label: 'Інші клавіші' }));
    const mid = h('div', { class: 'kscroll' });
    if (Keys.page === 'sym') {
      mid.appendChild(mk('wide', '⇥', () => Keys.press(9, Keys.shift), { label: 'Tab' }));
      mid.appendChild(mk('mod' + (Keys.shift ? ' on' : ''), 'Shift', () => { Keys.shift = !Keys.shift; Keys.build(); }, { label: 'Shift' }));
      mid.appendChild(mk('arrow', ic('left'), () => Keys.press(37, Keys.shift), { repeat: true, label: 'Ліворуч' }));
      mid.appendChild(mk('arrow', ic('up'), () => Keys.press(38, Keys.shift), { repeat: true, label: 'Вгору' }));
      mid.appendChild(mk('arrow', ic('down'), () => Keys.press(40, Keys.shift), { repeat: true, label: 'Вниз' }));
      mid.appendChild(mk('arrow', ic('right'), () => Keys.press(39, Keys.shift), { repeat: true, label: 'Праворуч' }));
      mid.appendChild(mk('txt', 'Home', () => Keys.press(36, Keys.shift)));
      mid.appendChild(mk('txt', 'End', () => Keys.press(35, Keys.shift)));
      for (const k of (K.set.keysSet || DEFAULTS.keysSet).split(/\s+/).filter(Boolean)) {
        mid.appendChild(mk('sym', esc(k), () => Keys.insert(k)));
      }
    } else {
      const act = (icon, label, run, repeat) => mk('act', ic(icon) + '<small>' + esc(label) + '</small>', run, { label, repeat });
      const glyph = (g, label, run) => mk('act', '<b class="glyph">' + esc(g) + '</b><small>' + esc(label) + '</small>', run, { label });
      mid.appendChild(act('paste', 'Вставити', () => Edit.paste()));
      mid.appendChild(act('copy', 'Копія', () => Edit.copy()));
      mid.appendChild(act('cut', 'Вирізати', () => Edit.cut()));
      mid.appendChild(act('select', 'Усе', () => K.ed.execCommand('selectall')));
      mid.appendChild(act('select', 'Рядок', () => K.ed.execCommand('expandtoline')));
      mid.appendChild(act('cursors', 'Ще таке', () => Cmd.exec('selectNext')));
      mid.appendChild(glyph('//', 'Коментар', () => Cmd.exec('comment')));
      mid.appendChild(act('copy', 'Дублювати', () => Cmd.exec('duplicate')));
      mid.appendChild(act('trash', 'Рядок', () => Cmd.exec('deleteLine'), true));
      mid.appendChild(act('arrowUp', 'Вгору', () => Cmd.exec('moveUp'), true));
      mid.appendChild(act('arrowDown', 'Вниз', () => Cmd.exec('moveDown'), true));
      mid.appendChild(act('indent', 'Відступ', () => Cmd.exec('indent')));
      mid.appendChild(act('outdent', 'Назад', () => Cmd.exec('outdent')));
      mid.appendChild(act('bookmark', 'Закладка', () => Edit.toggleBookmark()));
      mid.appendChild(act('target', 'Рядок №', () => Search.gotoLine()));
      mid.appendChild(act('list', 'Функції', () => Tools.outline()));
      mid.appendChild(act('fold', 'Згорнути', () => K.ed.execCommand('toggleFoldWidget')));
      mid.appendChild(mk('act' + (Macro.recording ? ' rec' : ''), ic(Macro.recording ? 'stop' : 'record') + '<small>' + (Macro.recording ? 'Стоп' : 'Запис') + '</small>', () => Macro.toggle(), { label: 'Запис макросу' }));
      mid.appendChild(act('play', 'Макрос', () => Macro.play(1)));
    }
    const right = h('div', { class: 'kfix' },
      mk('', ic('undo'), () => K.ed.execCommand('undo'), { repeat: true, label: 'Скасувати' }),
      mk('', ic('redo'), () => K.ed.execCommand('redo'), { repeat: true, label: 'Повторити' }));
    bar.appendChild(left);
    bar.appendChild(mid);
    bar.appendChild(right);
  },

  bind() {
    const bar = $('#keys');
    let rep = 0, delay = 0, moved = false, sx = 0, target = null;
    const stop = () => { clearTimeout(delay); clearInterval(rep); };
    bar.addEventListener('pointerdown', e => {
      const b = e.target.closest('.key');
      if (!b) return;
      e.preventDefault(); // не забирати фокус у редактора — клавіатура лишається
      moved = false; sx = e.clientX; target = b;
      b.classList.add('down');
      if (b.dataset.repeat) {
        delay = setTimeout(() => { moved = true; b._act(); rep = setInterval(() => b._act(), 55); }, 380);
      }
    });
    bar.addEventListener('pointermove', e => {
      if (target && Math.abs(e.clientX - sx) > 12) { moved = true; stop(); target.classList.remove('down'); }
    });
    const up = e => {
      const b = target;
      target = null;
      stop();
      if (!b) return;
      b.classList.remove('down');
      if (!moved && e.type === 'pointerup') b._act();
    };
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
    bar.addEventListener('contextmenu', e => e.preventDefault());
  },
};

// ==================================================================== панель над виділенням

const Sel = {
  lastTouch: 0,

  build() {
    const el = $('#selbar');
    el.innerHTML = '';
    const b = (label, run, icon) => {
      const x = h('button', { html: (icon ? ic(icon) : '') + '<span>' + label + '</span>' });
      x.addEventListener('pointerdown', e => e.preventDefault());
      x.addEventListener('click', () => { run(); });
      return x;
    };
    el.appendChild(b('Вирізати', () => { Edit.cut(); Sel.hide(); }));
    el.appendChild(b('Копіювати', () => { Edit.copy(); K.ed.clearSelection(); Sel.hide(); }));
    el.appendChild(b('Вставити', () => { Edit.paste(); Sel.hide(); }));
    el.appendChild(b('Усе', () => { K.ed.execCommand('selectall'); Sel.show(); }));
    el.appendChild(b('', () => Sel.more(), 'dots'));
  },

  more() {
    Sel.hide();
    UI.menu([
      { icon: 'search', label: 'Знайти виділене', run: () => Search.open(false) },
      { icon: 'replace', label: 'Замінити…', run: () => Search.open(true) },
      { icon: 'cursors', label: 'Додати наступне таке саме', run: () => Cmd.exec('selectNext') },
      { icon: 'cursors', label: 'Виділити всі такі самі', run: () => Cmd.exec('selectAllOcc') },
      { icon: 'columns', label: 'Блочне виділення', run: () => Edit.blockSelect() },
      '-',
      { glyph: '//', label: 'Коментар', run: () => Cmd.exec('comment') },
      { glyph: 'AB', label: 'ВЕРХНІЙ РЕГІСТР', run: () => Cmd.exec('upper') },
      { glyph: 'ab', label: 'нижній регістр', run: () => Cmd.exec('lower') },
      { icon: 'indent', label: 'Відступ', run: () => Cmd.exec('indent') },
      { icon: 'sort', label: 'Сортувати рядки', run: () => Edit.sort('asc') },
      { icon: 'share', label: 'Поділитися виділеним', run: () => Native.share(K.ed.getSelectedText(), '') },
      { icon: 'trash', label: 'Видалити', danger: true, run: () => K.ed.execCommand('del') },
    ], 'Виділене');
  },

  show() {
    const ed = K.ed;
    const el = $('#selbar');
    if (!el.firstChild) Sel.build();
    const r = ed.getSelectionRange();
    if (r.isEmpty()) { Sel.hide(); return; }
    const stage = $('#stage').getBoundingClientRect();
    const a = ed.renderer.textToScreenCoordinates(r.start.row, r.start.column);
    const z = ed.renderer.textToScreenCoordinates(r.end.row, r.end.column);
    const lh = ed.renderer.lineHeight;
    el.hidden = false;
    const w = el.offsetWidth, hh = el.offsetHeight;
    let top = a.pageY - stage.top - hh - 10;
    if (top < 6) top = z.pageY - stage.top + lh + 10;
    if (top + hh > stage.height - 6) top = Math.max(6, stage.height / 2 - hh / 2);
    let left = (a.pageY === z.pageY ? (a.pageX + z.pageX) / 2 : stage.width / 2 + stage.left) - stage.left - w / 2;
    left = clamp(left, 6, stage.width - w - 6);
    el.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
  },

  hide() { const el = $('#selbar'); if (el) el.hidden = true; },

  bind() {
    const ed = K.ed;
    const c = ed.container;
    let t0 = 0;
    c.addEventListener('touchstart', e => { t0 = Date.now(); Sel.lastTouch = t0; if (e.touches.length === 1) Sel.hide(); }, { passive: true, capture: true });
    c.addEventListener('touchend', e => {
      Sel.lastTouch = Date.now();
      // Після довгого натискання (виділення слова) не даємо браузеру «клацнути» і зняти виділення
      if (Date.now() - t0 > 420 && e.cancelable && !e.target.closest('.ace_gutter')) e.preventDefault();
      setTimeout(Sel.maybe, 30);
    }, { passive: false });
    ed.on('changeSelection', () => setTimeout(Sel.maybe, 0));
    ed.session && ed.on('changeSession', Sel.hide);
    ed.renderer.on('afterRender', () => { if (!$('#selbar').hidden) Sel.show(); });
    ed.on('input', () => { if (Date.now() - Sel.lastTouch > 400) Sel.hide(); });
  },

  maybe() {
    if (Date.now() - Sel.lastTouch > 900) return;
    if (K.ed.selection.isEmpty() || K.ed.inMultiSelectMode) { Sel.hide(); return; }
    Sel.show();
  },
};

// ==================================================================== жести і поля

const Gestures = {
  bind() {
    const ed = K.ed;
    // Щипок — масштаб шрифту
    const c = ed.container;
    let d0 = 0, f0 = 0, size = 0;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    c.addEventListener('touchstart', e => {
      if (e.touches.length === 2) { d0 = dist(e.touches); f0 = K.set.fontSize; size = f0; }
    }, { passive: true, capture: true });
    c.addEventListener('touchmove', e => {
      if (e.touches.length !== 2 || !d0) return;
      const n = clamp(Math.round(f0 * dist(e.touches) / d0), 8, 40);
      if (n !== size) { size = n; ed.setFontSize(n); Gestures.zoomHint(n); }
    }, { passive: true, capture: true });
    c.addEventListener('touchend', e => {
      if (d0 && e.touches.length < 2) {
        d0 = 0;
        if (size && size !== K.set.fontSize) Settings.set('fontSize', size);
      }
    }, { passive: true, capture: true });

    // Торкання номера рядка — закладка (стрілка згортання працює як звичайно)
    ed.on('gutterclick', e => {
      const t = e.domEvent.target;
      if (t.classList.contains('ace_fold-widget') || t.closest('.ace_fold-widget')) return;
      if (t.closest('.ace_gutter_annotation') || t.classList.contains('ace_gutter_annotation')) return;
      const row = e.getDocumentPosition().row;
      Edit.toggleBookmark(row);
      e.stop();
    });
    ed.on('guttermousedown', e => {
      const t = e.domEvent.target;
      if (t.classList.contains('ace_fold-widget')) return;
      e.stop();
    });
  },

  zoomHint(n) {
    UI.toast('Шрифт ' + n + ' px', { ms: 700 });
  },
};

// ==================================================================== клавіатура екрана

const Viewport = {
  maxH: 0,
  bind() {
    const check = () => {
      const hgt = window.innerHeight;
      const key = window.innerWidth > hgt ? 'l' : 'p';
      if (Viewport.key !== key) { Viewport.key = key; Viewport.maxH = hgt; }
      Viewport.maxH = Math.max(Viewport.maxH, hgt);
      const kb = hgt < Viewport.maxH * 0.78;
      document.body.classList.toggle('kb', kb);
      if (K.ed) {
        K.ed.resize();
        if (kb && K.ed.isFocused()) setTimeout(() => K.ed.renderer.scrollCursorIntoView(null, 0.5), 60);
      }
    };
    window.addEventListener('resize', check);
    check();
  },
};
