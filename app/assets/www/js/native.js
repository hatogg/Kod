'use strict';
/* Обгортка над JS-мостом window.Android. У звичайному браузері — імітація (mock.js). */

const Native = (() => {
  const real = !!(window.Android && typeof window.Android.hello === 'function');
  const A = real ? window.Android : makeMock();
  const T = A.hello() || '';
  const j = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
  const picks = {}, finds = {};
  let seq = 0;

  return {
    real,
    info: () => j(A.info(T), {}),
    encodings: () => j(A.encodings(T), []),

    /** kind: open | folder | save. Повертає Promise з результатом вибору. */
    pick(kind, name) {
      return new Promise(res => {
        const id = 'p' + (++seq);
        picks[id] = res;
        A.pick(T, id, kind, name || '');
      });
    },
    onPick(id, r) {
      const f = picks[id];
      delete picks[id];
      if (f) f(r || { ok: false });
    },

    read(uri, enc) {
      const m = j(A.read(T, uri, enc || 'auto'), { ok: false, err: 'bridge' });
      if (m.ok) m.text = A.text(T);
      return m;
    },
    write: (uri, text, enc, bom, eol) => j(A.write(T, uri, text, enc, !!bom, eol), { ok: false }),
    unmappable: (text, enc) => A.unmappable(T, text, enc) | 0,
    stat: uri => j(A.stat(T, uri), {}),

    list: (tree, id) => j(A.list(T, tree, id || ''), { ok: false }),
    docUri: (tree, id) => A.docUri(T, tree, id),
    rootId: tree => A.rootId(T, tree),
    create: (tree, parent, name, dir) => j(A.create(T, tree, parent || '', name, !!dir), { ok: false }),
    rename: (tree, id, name) => j(A.rename(T, tree, id, name), { ok: false }),
    remove: (tree, id) => j(A.remove(T, tree, id), { ok: false }),
    resolve: (tree, rel) => j(A.resolve(T, tree, rel), { ok: false }),
    treeName: tree => A.treeName(T, tree),

    find(tree, startId, startPath, opts, replace, onData) {
      const id = 'f' + (++seq);
      finds[id] = onData;
      A.find(T, id, tree, startId || '', startPath || '', JSON.stringify(opts), !!replace);
      return id;
    },
    onFind(id, data) {
      const f = finds[id];
      if (!f) return;
      if (data && data.done) delete finds[id];
      f(data || { done: true });
    },
    cancel: id => A.cancel(T, id),

    kvPut: (k, v) => A.kvPut(T, k, typeof v === 'string' ? v : JSON.stringify(v)),
    kvGet: (k, d) => j(A.kvGet(T, k), d),
    backupPut: (id, text) => A.backupPut(T, id, text),
    backupGet: id => { const s = A.backupGet(T, id); return s == null ? null : String(s); },
    backupDel: id => A.backupDel(T, id),
    backupKeys: () => j(A.backupKeys(T), []),

    clipGet: () => A.clipGet(T) || '',
    clipSet: text => A.clipSet(T, text),
    share: (text, name) => A.share(T, text, name || ''),
    view: (url, mime) => A.view(T, url, mime || ''),
    hash: (text, algo) => A.hash(T, text, algo),
    print: (html, title) => A.print(T, html, title),
    previewSet: o => A.previewSet(T, JSON.stringify(o)),
    intent: () => j(A.intent(T), null),
    bars: (color, light) => A.bars(T, color, !!light),
    debug: on => A.debug(T, !!on),
    persisted: () => j(A.persisted(T), []),
    release: uri => A.release(T, uri),
    exit: () => A.exit(T),
  };
})();

const PREVIEW_ORIGIN = 'https://preview.appassets.androidplatform.net';
