'use strict';
/* Бічна панель: папка проєкту (дерево файлів) і недавні файли. */

const Workspace = {
  set(tree, name, open) {
    K.ws = { tree, name: name || Native.treeName(tree) || 'Папка', rootId: Native.rootId(tree), open: new Set(open || []), cache: new Map() };
    Session.save();
    Drawer.render();
  },

  async pick() {
    const r = await Native.pick('folder');
    if (!r || !r.ok) return;
    Workspace.set(r.uri, r.name, []);
    Drawer.open();
    UI.toast('Папку «' + K.ws.name + '» відкрито');
  },

  close() {
    if (!K.ws) return;
    const tree = K.ws.tree;
    K.ws = null;
    if (!K.tabs.some(t => t.tree === tree)) Native.release(tree);
    Session.save();
    Drawer.render();
  },

  items(id) {
    const ws = K.ws;
    if (!ws) return [];
    const key = id || ws.rootId;
    if (ws.cache.has(key)) return ws.cache.get(key);
    const r = Native.list(ws.tree, key);
    if (!r.ok) {
      if (r.err === 'access') { UI.toast('Немає доступу до папки — відкрийте її знову', { error: true }); }
      ws.cache.set(key, []);
      return [];
    }
    ws.cache.set(key, r.items);
    return r.items;
  },

  refresh(id) {
    if (!K.ws) return;
    if (id) K.ws.cache.delete(id); else K.ws.cache.clear();
    Drawer.render();
  },

  openFile(item, path) {
    const ws = K.ws;
    Drawer.close();
    return Files.open(Native.docUri(ws.tree, item.id), { name: item.name, tree: ws.tree, docId: item.id, path });
  },

  async create(dirId, dirPath, isDir) {
    const ws = K.ws;
    const name = await UI.prompt(isDir ? 'Нова папка' : 'Новий файл', isDir ? '' : '', { placeholder: isDir ? 'назва' : 'наприклад, index.html', ok: 'Створити' });
    if (!name || !name.trim()) return;
    const clean = name.trim();
    if (/[\\/:*?"<>|]/.test(clean) && !(clean.includes('/') && !isDir)) { UI.toast('Недопустимі символи в назві', { error: true }); return; }
    // «src/app.js» — створити вкладені папки
    const parts = clean.split('/').filter(Boolean);
    let parentId = dirId || ws.rootId, parentPath = dirPath || '';
    for (let i = 0; i < parts.length - 1; i++) {
      const existing = Workspace.items(parentId).find(x => x.dir && x.name === parts[i]);
      let id = existing && existing.id;
      if (!id) {
        const r = Native.create(ws.tree, parentId, parts[i], true);
        if (!r.ok) { UI.toast('Не вдалося створити папку', { error: true }); return; }
        id = r.id;
        ws.cache.delete(parentId);
      }
      parentId = id;
      parentPath = parentPath ? parentPath + '/' + parts[i] : parts[i];
      ws.open.add(id);
    }
    const leaf = parts[parts.length - 1];
    if (Workspace.items(parentId).some(x => x.name === leaf)) { UI.toast('«' + leaf + '» уже існує', { error: true }); return; }
    const r = Native.create(ws.tree, parentId, leaf, isDir);
    if (!r.ok) { UI.toast('Не вдалося створити: ' + (r.err || ''), { error: true }); return; }
    ws.cache.delete(parentId);
    if (dirId) ws.open.add(dirId);
    if (isDir) { ws.open.add(r.id); Drawer.render(); return; }
    Drawer.render();
    const path = parentPath ? parentPath + '/' + r.name : r.name;
    const tab = await Workspace.openFile({ id: r.id, name: r.name }, path);
    if (tab && tab.session.getLength() <= 1) Workspace.template(tab);
  },

  /** Заготовка для нового порожнього HTML-файлу. */
  template(tab) {
    if (tab.mode === 'html') {
      tab.session.setValue('<!doctype html>\n<html lang="uk">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>' + tab.name.replace(/\.\w+$/, '') + '</title>\n</head>\n<body>\n  \n</body>\n</html>\n');
      tab.session.selection.moveTo(8, 2);
      tab.forceDirty = true;
      Tabs.render();
    }
  },

  async rename(item, path, parentId) {
    const ws = K.ws;
    const name = await UI.prompt('Перейменувати', item.name, { select: item.dir ? true : 'name', ok: 'Перейменувати' });
    if (!name || !name.trim() || name.trim() === item.name) return;
    const r = Native.rename(ws.tree, item.id, name.trim());
    if (!r.ok) { UI.toast('Не вдалося перейменувати: ' + (r.err || ''), { error: true }); return; }
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const newPath = parentPath ? parentPath + '/' + r.name : r.name;
    for (const t of K.tabs) {
      if (t.tree !== ws.tree || !t.path) continue;
      if (t.path === path) {
        Object.assign(t, { docId: r.id, uri: r.uri, path: newPath, name: r.name });
        if (t.loaded && !item.dir) Tabs.setMode(t, Langs.detect(t.name, ''), false);
      } else if (t.path.startsWith(path + '/')) {
        const np = newPath + t.path.slice(path.length);
        const rr = Native.resolve(ws.tree, np);
        if (rr.ok) Object.assign(t, { docId: rr.id, uri: rr.uri, path: np });
      }
    }
    if (ws.open.delete(item.id)) ws.open.add(r.id);
    ws.cache.delete(parentId || ws.rootId);
    ws.cache.delete(item.id);
    Tabs.render();
    Session.save();
    Drawer.render();
  },

  async remove(item, path, parentId) {
    const ws = K.ws;
    const ok = await UI.confirm('Видалити ' + (item.dir ? 'папку' : 'файл') + '?', '«' + path + '»' + (item.dir ? ' з усім вмістом' : '') + ' буде видалено назавжди.', 'Видалити', true);
    if (!ok) return;
    const r = Native.remove(ws.tree, item.id);
    if (!r.ok) { UI.toast('Не вдалося видалити', { error: true }); return; }
    for (const t of K.tabs) {
      if (t.tree === ws.tree && t.path && (t.path === path || t.path.startsWith(path + '/'))) {
        Object.assign(t, { uri: null, tree: null, docId: null, path: null, forceDirty: true });
      }
    }
    ws.cache.delete(parentId || ws.rootId);
    Tabs.render();
    Drawer.render();
    UI.toast('Видалено «' + item.name + '»');
  },

  async renameTab(t) {
    const ws = K.ws;
    if (!ws || ws.tree !== t.tree) { UI.toast('Відкрийте папку цього файлу, щоб перейменувати'); return; }
    const parentPath = t.path.includes('/') ? t.path.slice(0, t.path.lastIndexOf('/')) : '';
    let parentId = ws.rootId;
    if (parentPath) { const r = Native.resolve(ws.tree, parentPath); if (r.ok) parentId = r.id; }
    await Workspace.rename({ id: t.docId, name: t.name, dir: false }, t.path, parentId);
  },

  touched() { /* файл збережено — дерево не змінюється */ },
};

// ==================================================================== панель

const Drawer = {
  isOpen: false,

  open() {
    Drawer.render();
    Drawer.isOpen = true;
    $('#drawer').classList.add('on');
    $('#drawer').setAttribute('aria-hidden', 'false');
    if (K.ed) K.ed.blur();
  },

  close() {
    Drawer.isOpen = false;
    $('#drawer').classList.remove('on');
    $('#drawer').setAttribute('aria-hidden', 'true');
  },

  toggle() { Drawer.isOpen ? Drawer.close() : Drawer.open(); },

  bind() {
    $('#drawer .scrim').addEventListener('click', Drawer.close);
    const panel = $('#drawer .panel');
    let x0 = null;
    panel.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    panel.addEventListener('touchend', e => {
      if (x0 != null && x0 - e.changedTouches[0].clientX > 70) Drawer.close();
      x0 = null;
    });
  },

  render() {
    const panel = $('#drawer .panel');
    if (!panel) return;
    const scroll = panel.scrollTop;
    panel.innerHTML = '';
    panel.appendChild(h('div', { class: 'dhead' },
      h('div', { class: 'dlogo', html: ic('code') }),
      h('div', { class: 'dname' }, h('b', { text: 'Код' }), h('small', { text: 'редактор коду' })),
      h('button', { class: 'ib', html: ic('sliders'), 'aria-label': 'Налаштування', onclick: () => { Drawer.close(); Settings.open(); } })));
    panel.appendChild(h('div', { class: 'dquick' },
      h('button', { class: 'qbtn', onclick: () => { Drawer.close(); Tabs.newTab(); } }, h('span', { html: ic('filePlus') }), 'Новий'),
      h('button', { class: 'qbtn', onclick: () => { Drawer.close(); Files.pickOpen(); } }, h('span', { html: ic('file') }), 'Відкрити'),
      h('button', { class: 'qbtn', onclick: () => Workspace.pick() }, h('span', { html: ic('folderOpen') }), 'Папка')));

    // ---- папка проєкту
    const ws = K.ws;
    if (ws) {
      panel.appendChild(h('div', { class: 'dsec' },
        h('span', { class: 'dsect', html: ic('folder') + '<b>' + esc(ws.name) + '</b>' }),
        h('span', { class: 'dsacts' },
          h('button', { class: 'ib sm', html: ic('filePlus'), title: 'Новий файл', onclick: () => Workspace.create(null, '', false) }),
          h('button', { class: 'ib sm', html: ic('folderPlus'), title: 'Нова папка', onclick: () => Workspace.create(null, '', true) }),
          h('button', { class: 'ib sm', html: ic('search'), title: 'Знайти в папці', onclick: () => { Drawer.close(); Search.inFiles(); } }),
          h('button', { class: 'ib sm', html: ic('refresh'), title: 'Оновити', onclick: () => Workspace.refresh() }),
          h('button', { class: 'ib sm', html: ic('dots'), title: 'Ще', onclick: () => Drawer.wsMenu() }))));
      const tree = h('div', { class: 'tree' });
      Drawer.renderDir(tree, ws.rootId, '', 0);
      if (!tree.children.length) tree.appendChild(h('div', { class: 'dempty', text: 'Папка порожня' }));
      panel.appendChild(tree);
    } else {
      panel.appendChild(h('div', { class: 'dsec' }, h('span', { class: 'dsect', html: ic('folder') + '<b>Папка проєкту</b>' })));
      panel.appendChild(h('div', { class: 'dhint' },
        h('p', { text: 'Відкрийте папку, щоб бачити дерево файлів, шукати й замінювати в усіх файлах і запускати сайти з CSS та скриптами.' }),
        h('button', { class: 'btn primary', onclick: () => Workspace.pick() }, 'Відкрити папку')));
    }

    // ---- недавні
    const rec = Recent.list.filter(r => !K.tabs.some(t => t.uri === r.uri)).slice(0, 25);
    panel.appendChild(h('div', { class: 'dsec' },
      h('span', { class: 'dsect', html: ic('clock') + '<b>Недавні</b>' }),
      rec.length ? h('span', { class: 'dsacts' }, h('button', { class: 'ib sm', html: ic('trash'), title: 'Очистити', onclick: async () => {
        if (await UI.confirm('Очистити недавні?', 'Файли не буде видалено — лише список.', 'Очистити')) { Recent.clear(); Drawer.render(); }
      } })) : null));
    const list = h('div', { class: 'rlist' });
    for (const r of rec) {
      list.appendChild(h('button', {
        class: 'ritem', onclick: () => { Drawer.close(); Files.open(r.uri, { name: r.name, tree: r.tree, docId: r.docId, path: r.path }); },
      }, Langs.badgeEl(r.name),
      h('span', { class: 'rname' }, h('span', { text: r.name }), h('small', { text: (r.path && r.path !== r.name ? r.path.slice(0, r.path.length - r.name.length - 1) + ' · ' : '') + fmtAgo(r.t) }))));
    }
    if (!rec.length) list.appendChild(h('div', { class: 'dempty', text: 'Тут з’являться файли, які ви відкривали' }));
    panel.appendChild(list);
    panel.scrollTop = scroll;
  },

  renderDir(box, id, path, depth) {
    const items = Workspace.items(id);
    for (const it of items) {
      const p = path ? path + '/' + it.name : it.name;
      const open = it.dir && K.ws.open.has(it.id);
      const active = !it.dir && K.cur && K.cur.tree === K.ws.tree && K.cur.path === p;
      const row = h('div', {
        class: 'trow' + (it.dir ? ' dir' : '') + (open ? ' open' : '') + (active ? ' on' : '') + (it.name.startsWith('.') ? ' dim' : ''),
        style: { paddingLeft: (10 + depth * 16) + 'px' },
      },
      h('span', { class: 'tchev', html: it.dir ? ic('right') : '' }),
      it.dir ? h('span', { class: 'fbadge dir', html: ic(open ? 'folderOpen' : 'folder') }) : Langs.badgeEl(it.name),
      h('span', { class: 'tlabel', text: it.name }),
      K.tabs.some(t => t.tree === K.ws.tree && t.path === p && t.dirty) ? h('i', { class: 'tdirty' }) : null);
      Drawer.press(row, () => {
        if (it.dir) {
          if (open) K.ws.open.delete(it.id); else K.ws.open.add(it.id);
          Session.save();
          Drawer.render();
        } else Workspace.openFile(it, p);
      }, () => Drawer.itemMenu(it, p, id));
      box.appendChild(row);
      if (open) {
        const sub = h('div', { class: 'tsub' });
        Drawer.renderDir(sub, it.id, p, depth + 1);
        if (!sub.children.length) sub.appendChild(h('div', { class: 'dempty', style: { paddingLeft: (36 + depth * 16) + 'px' }, text: 'порожньо' }));
        box.appendChild(sub);
      }
    }
  },

  /** Натискання і довге натискання. */
  press(el, tap, long) {
    let t = 0, fired = false, sx = 0, sy = 0;
    el.addEventListener('pointerdown', e => {
      fired = false; sx = e.clientX; sy = e.clientY;
      t = setTimeout(() => { fired = true; long(); }, 480);
    });
    el.addEventListener('pointermove', e => { if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10) clearTimeout(t); });
    el.addEventListener('pointerup', () => clearTimeout(t));
    el.addEventListener('pointercancel', () => clearTimeout(t));
    el.addEventListener('contextmenu', e => { e.preventDefault(); });
    el.addEventListener('touchend', e => { if (fired && e.cancelable) { e.preventDefault(); fired = false; } }, { passive: false });
    el.addEventListener('click', () => { if (fired) { fired = false; return; } tap(); });
  },

  itemMenu(it, path, parentId) {
    const ws = K.ws;
    UI.menu([
      { header: path },
      !it.dir ? { icon: 'file', label: 'Відкрити', run: () => Workspace.openFile(it, path) } : null,
      it.dir ? { icon: 'filePlus', label: 'Новий файл тут', run: () => Workspace.create(it.id, path, false) } : null,
      it.dir ? { icon: 'folderPlus', label: 'Нова папка тут', run: () => Workspace.create(it.id, path, true) } : null,
      it.dir ? { icon: 'search', label: 'Знайти в цій папці', run: () => { Drawer.close(); Search.inFiles({ id: it.id, path }); } } : null,
      !it.dir && /^(html?|svg|xhtml)$/i.test(Langs.ext(it.name)) ? { icon: 'play', label: 'Запустити', run: async () => { const t = await Workspace.openFile(it, path); if (t) Tools.run(t); } } : null,
      '-',
      { icon: 'pencil', label: 'Перейменувати…', run: () => Workspace.rename(it, path, parentId) },
      { icon: 'copy', label: 'Копіювати шлях', run: () => { Native.clipSet(path); UI.toast('Скопійовано: ' + path); } },
      !it.dir ? { icon: 'external', label: 'Відкрити в іншому застосунку', run: () => Native.view(Native.docUri(ws.tree, it.id), Files.mime(it.name)) } : null,
      '-',
      { icon: 'trash', label: 'Видалити', danger: true, run: () => Workspace.remove(it, path, parentId) },
    ], it.name);
  },

  wsMenu() {
    UI.menu([
      { icon: 'unfold', label: 'Згорнути всі папки', run: () => { K.ws.open.clear(); Session.save(); Drawer.render(); } },
      { icon: 'folderOpen', label: 'Відкрити іншу папку…', run: () => Workspace.pick() },
      { icon: 'x', label: 'Закрити папку', run: () => Workspace.close() },
    ], K.ws.name);
  },
};
