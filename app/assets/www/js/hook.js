/* Впроваджується в сторінки перегляду: пересилає консоль і помилки в редактор «Код». */
(function () {
  'use strict';
  if (window.__kodHook || window.parent === window) return;
  window.__kodHook = true;
  var parentWin = window.parent;

  function fmt(v, depth, seen) {
    depth = depth || 0;
    seen = seen || [];
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    var t = typeof v;
    if (t === 'string') return depth ? JSON.stringify(v) : v;
    if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v) + (t === 'bigint' ? 'n' : '');
    if (t === 'symbol') return v.toString();
    if (t === 'function') return 'ƒ ' + (v.name || 'anonymous') + '()';
    if (v instanceof Error) return (v.name || 'Error') + ': ' + v.message + (v.stack && depth === 0 ? '\n' + String(v.stack).split('\n').slice(1, 5).join('\n') : '');
    if (typeof Element !== 'undefined' && v instanceof Element) {
      return '<' + v.tagName.toLowerCase() + (v.id ? '#' + v.id : '') + (v.className && typeof v.className === 'string' ? '.' + v.className.trim().split(/\s+/).join('.') : '') + '>';
    }
    if (seen.indexOf(v) >= 0) return '[циклічне посилання]';
    if (depth > 3) return Array.isArray(v) ? '[…]' : '{…}';
    seen.push(v);
    try {
      if (Array.isArray(v)) {
        var items = v.slice(0, 100).map(function (x) { return fmt(x, depth + 1, seen); });
        if (v.length > 100) items.push('… ще ' + (v.length - 100));
        return '[' + items.join(', ') + ']';
      }
      if (v instanceof Map) return 'Map(' + v.size + ') {' + Array.from(v).slice(0, 50).map(function (e) { return fmt(e[0], depth + 1, seen) + ' => ' + fmt(e[1], depth + 1, seen); }).join(', ') + '}';
      if (v instanceof Set) return 'Set(' + v.size + ') {' + Array.from(v).slice(0, 50).map(function (x) { return fmt(x, depth + 1, seen); }).join(', ') + '}';
      if (v instanceof Date) return v.toISOString();
      if (v instanceof RegExp) return String(v);
      if (typeof Promise !== 'undefined' && v instanceof Promise) return 'Promise {…}';
      var keys = Object.keys(v);
      var name = v.constructor && v.constructor.name && v.constructor.name !== 'Object' ? v.constructor.name + ' ' : '';
      var parts = keys.slice(0, 50).map(function (k) { return (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)) + ': ' + fmt(v[k], depth + 1, seen); });
      if (keys.length > 50) parts.push('…');
      return name + '{' + parts.join(', ') + '}';
    } catch (e) {
      return String(v);
    } finally {
      seen.pop();
    }
  }

  function send(type, args) {
    try {
      parentWin.postMessage({ __kod: 1, type: type, args: Array.prototype.map.call(args, function (a) { return fmt(a); }) }, '*');
    } catch (e) { /* ігноруємо */ }
  }

  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (k) {
    var orig = console[k];
    console[k] = function () {
      send(k === 'log' ? 'log' : k, arguments);
      if (orig) orig.apply(console, arguments);
    };
  });
  var origTable = console.table;
  console.table = function (data) { send('log', [data]); if (origTable) origTable.apply(console, arguments); };
  var origClear = console.clear;
  console.clear = function () { send('clear', []); if (origClear) origClear.apply(console); };

  window.addEventListener('error', function (e) {
    var where = e.filename ? ' (' + String(e.filename).split('/').pop().split('?')[0] + ':' + e.lineno + ')' : '';
    send('error', [(e.message || 'Помилка') + where]);
  });
  window.addEventListener('unhandledrejection', function (e) {
    send('error', ['Необроблений Promise: ' + fmt(e.reason)]);
  });

  window.addEventListener('message', function (e) {
    if (e.source !== parentWin || !e.data || !e.data.__kodEval) return;
    try {
      var r = (0, eval)(e.data.code);
      if (r && typeof r.then === 'function') {
        r.then(function (v) { send('result', ['Promise → ' + fmt(v, 0)]); }, function (err) { send('error', [fmt(err)]); });
      } else {
        parentWin.postMessage({ __kod: 1, type: 'result', args: [fmt(r, 1)] }, '*');
      }
    } catch (err) {
      send('error', [fmt(err)]);
    }
  });
})();
