'use strict';
/* Мови: визначення режиму підсвітки, значки файлів, список функцій, що можна запускати. */

const Langs = (() => {
  const modelist = ace.require('ace/ext/modelist');

  const BADGES = {
    js: ['JS', '#e8c547'], mjs: ['JS', '#e8c547'], cjs: ['JS', '#e8c547'], jsx: ['JSX', '#5fd3f3'],
    ts: ['TS', '#4c8eda'], tsx: ['TSX', '#4c8eda'], html: ['HTML', '#e8743b'], htm: ['HTML', '#e8743b'],
    xhtml: ['HTML', '#e8743b'], css: ['CSS', '#5b8ee6'], scss: ['SCSS', '#cd6799'], sass: ['SASS', '#cd6799'],
    less: ['LESS', '#5a7fc1'], json: ['{ }', '#a0c25b'], jsonc: ['{ }', '#a0c25b'], md: ['MD', '#8f9bb3'],
    markdown: ['MD', '#8f9bb3'], py: ['PY', '#4f8ec9'], pyw: ['PY', '#4f8ec9'], ipynb: ['IPY', '#e87b35'],
    java: ['JAVA', '#e76f00'], kt: ['KT', '#a97bff'], kts: ['KTS', '#a97bff'], gradle: ['GRDL', '#5fa07d'],
    c: ['C', '#7b97c4'], h: ['H', '#7b97c4'], cpp: ['C++', '#6f8fd8'], cc: ['C++', '#6f8fd8'], cxx: ['C++', '#6f8fd8'],
    hpp: ['H++', '#6f8fd8'], cs: ['C#', '#9b6bdf'], php: ['PHP', '#8892bf'], rb: ['RB', '#d14b4b'], go: ['GO', '#29beb0'],
    rs: ['RS', '#d6824a'], sh: ['SH', '#6bbf59'], bash: ['SH', '#6bbf59'], zsh: ['SH', '#6bbf59'], fish: ['SH', '#6bbf59'],
    sql: ['SQL', '#e3a33f'], xml: ['XML', '#e8743b'], svg: ['SVG', '#f0b23f'], yml: ['YML', '#d0564f'],
    yaml: ['YML', '#d0564f'], toml: ['TOML', '#9c8f84'], ini: ['INI', '#8f9bb3'], cfg: ['CFG', '#8f9bb3'],
    conf: ['CONF', '#8f9bb3'], properties: ['PROP', '#8f9bb3'], env: ['ENV', '#d8c15a'], lua: ['LUA', '#5a6fd6'],
    txt: ['TXT', '#8f9bb3'], log: ['LOG', '#8f9bb3'], csv: ['CSV', '#4caf7a'], tsv: ['TSV', '#4caf7a'],
    dart: ['DART', '#3fb6d3'], swift: ['SWFT', '#f05138'], vue: ['VUE', '#42b883'], svelte: ['SVLT', '#ff5a2c'],
    bat: ['BAT', '#b9bec7'], cmd: ['CMD', '#b9bec7'], ps1: ['PS', '#4c8eda'], pl: ['PL', '#3a7ab8'], r: ['R', '#2f7ccf'],
    scala: ['SCL', '#de3423'], hs: ['HS', '#8f5ac2'], ex: ['EX', '#8a5ab8'], exs: ['EX', '#8a5ab8'], erl: ['ERL', '#b83998'],
    clj: ['CLJ', '#63b132'], groovy: ['GRV', '#4298b8'], tex: ['TEX', '#3d6117'], diff: ['DIFF', '#7bb661'],
    patch: ['DIFF', '#7bb661'], srt: ['SRT', '#8f9bb3'], asm: ['ASM', '#8f9bb3'], s: ['ASM', '#8f9bb3'],
    makefile: ['MAKE', '#c9a15a'], dockerfile: ['DOCK', '#2496ed'], gitignore: ['GIT', '#f05033'],
  };

  const ext = name => {
    const n = (name || '').toLowerCase();
    const base = n.split('/').pop();
    if (base === 'makefile' || base === 'gnumakefile') return 'makefile';
    if (base === 'dockerfile') return 'dockerfile';
    if (base === '.gitignore' || base === '.dockerignore') return 'gitignore';
    if (base.startsWith('.env')) return 'env';
    const dot = base.lastIndexOf('.');
    return dot >= 0 ? base.slice(dot + 1) : '';
  };

  function badge(name) {
    const e = ext(name);
    if (BADGES[e]) return BADGES[e];
    return [e ? e.slice(0, 4).toUpperCase() : 'TXT', '#8f9bb3'];
  }

  function badgeEl(name, dir) {
    if (dir) return h('span', { class: 'fbadge dir', html: ic('folder') });
    const [label, color] = badge(name);
    return h('span', { class: 'fbadge', style: { '--c': color }, text: label });
  }

  function detect(name, text) {
    let mode = modelist.getModeForPath(name || '').name;
    const e = ext(name);
    if (e === 'env') mode = 'sh';
    if (e === 'jsonc' || e === 'json5') mode = 'json5' in modelist.modesByName ? 'json5' : 'json';
    if (mode === 'text' && text) {
      const first = text.slice(0, 200).split('\n')[0];
      if (/^#!.*\b(ba|z|k|da)?sh\b/.test(first)) mode = 'sh';
      else if (/^#!.*\bpython/.test(first)) mode = 'python';
      else if (/^#!.*\bnode\b/.test(first)) mode = 'javascript';
      else if (/^#!.*\bperl\b/.test(first)) mode = 'perl';
      else if (/^#!.*\bruby\b/.test(first)) mode = 'ruby';
      else if (/^#!.*\bphp\b/.test(first)) mode = 'php';
      else if (/^\s*<\?xml/.test(first)) mode = 'xml';
      else if (/^\s*<!doctype html|^\s*<html/i.test(first)) mode = 'html';
      else if (/^\s*[{[]/.test(text) && name && !e) {
        try { JSON.parse(text); mode = 'json'; } catch (err) { /* не JSON */ }
      }
    }
    return mode;
  }

  const caption = mode => (modelist.modesByName[mode] || {}).caption || mode;

  /** Розширення для нового файлу за режимом. */
  function extFor(mode) {
    const m = modelist.modesByName[mode];
    if (!m || mode === 'text') return 'txt';
    const first = m.extensions.split('|').find(x => x && !x.startsWith('^'));
    const fix = { javascript: 'js', python: 'py', markdown: 'md', c_cpp: 'cpp', csharp: 'cs', golang: 'go', sh: 'sh', typescript: 'ts', kotlin: 'kt', ruby: 'rb', rust: 'rs', yaml: 'yml' };
    return fix[mode] || first || 'txt';
  }

  const POPULAR = ['text', 'javascript', 'typescript', 'html', 'css', 'json', 'markdown', 'python', 'java', 'kotlin', 'c_cpp', 'csharp', 'php', 'sh', 'sql', 'xml', 'yaml', 'golang', 'rust', 'lua'];

  function modes() {
    return modelist.modes.slice().sort((a, b) => a.caption.localeCompare(b.caption));
  }

  function runKind(tab) {
    const e = ext(tab.name);
    if (tab.mode === 'html' || ['html', 'htm', 'xhtml', 'svg'].includes(e)) return 'html';
    if (tab.mode === 'javascript' && !['json'].includes(e)) return 'js';
    if (tab.mode === 'markdown') return 'md';
    return null;
  }

  // ---------------------------------------------------------------- список функцій

  const JS_KW = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'with', 'else', 'do', 'try', 'new', 'typeof', 'await', 'super']);
  const C_KW = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'else', 'do', 'try', 'new', 'sizeof', 'delete', 'throw', 'case', 'using', 'lock', 'foreach', 'synchronized', 'when', 'elif']);

  const R = {
    js: [
      [/^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, 'class'],
      [/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, 'fn'],
      [/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/, 'fn'],
      [/^\s*(?:export\s+)?(?:declare\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/, 'type'],
      [/^\s+(?:(?:static|async|get|set|public|private|protected|readonly|override)\s+)*\*?([A-Za-z_$#][\w$]*)\s*\([^)]*\)\s*(?::\s*[^{=]+)?\{\s*(?:\}\s*)?$/, 'method', JS_KW],
      [/^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/, 'method'],
    ],
    python: [
      [/^\s*class\s+(\w+)/, 'class'],
      [/^\s*(?:async\s+)?def\s+(\w+)/, 'fn'],
    ],
    c: [
      [/^\s*(?:(?:public|private|protected|internal|abstract|final|static|sealed|data|open|partial|inner|export|inline|value|enum|annotation)\s+)*(?:class|interface|enum|struct|record|object|trait|protocol|extension|union|namespace)\s+([A-Za-z_][\w.]*)/, 'class'],
      [/^\s*(?:(?:public|private|protected|internal|override|open|suspend|inline|private|operator|infix|tailrec)\s+)*fun\s+(?:<[^>]+>\s*)?(?:[\w.]+\.)?(\w+)\s*\(/, 'fn'],
      [/^\s*(?:(?:public|private|fileprivate|internal|open|static|class|override|mutating|@\w+)\s+)*func\s+(\w+)/, 'fn'],
      [/^\s*(?:[\w<>\[\],:*&?]+\s+)+[*&]*(\w+)\s*\([^;{}()]*(?:\([^)]*\)[^;{}()]*)*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:throws\s+[\w., ]+)?(?:\s*:\s*[^{;]+)?\s*\{?\s*$/, 'fn', C_KW],
    ],
    go: [
      [/^func\s+(?:\([^)]*\)\s*)?(\w+)/, 'fn'],
      [/^type\s+(\w+)\s+(?:struct|interface)/, 'class'],
    ],
    rust: [
      [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|union)\s+(\w+)/, 'class'],
      [/^\s*impl(?:<[^>]*>)?\s+([\w:<>, ]+?)(?:\s+for\s+([\w:<>]+))?\s*\{/, 'class'],
      [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"\w+"\s+)?fn\s+(\w+)/, 'fn'],
    ],
    php: [
      [/^\s*(?:abstract\s+|final\s+)?(?:class|interface|trait|enum)\s+(\w+)/, 'class'],
      [/^\s*(?:(?:public|private|protected|static|abstract|final)\s+)*function\s+&?(\w+)/, 'fn'],
    ],
    ruby: [
      [/^\s*(?:class|module)\s+([\w:]+)/, 'class'],
      [/^\s*def\s+((?:self\.)?[\w?!=]+)/, 'fn'],
    ],
    lua: [
      [/^\s*(?:local\s+)?function\s+([\w.:]+)/, 'fn'],
      [/^\s*(?:local\s+)?([\w.]+)\s*=\s*function\b/, 'fn'],
    ],
    sh: [
      [/^\s*(?:function\s+)?([A-Za-z_][\w:-]*)\s*\(\)\s*\{?/, 'fn'],
      [/^\s*function\s+([A-Za-z_][\w:-]*)/, 'fn'],
    ],
    markdown: [[/^(#{1,6})\s+(.+?)\s*#*\s*$/, 'heading']],
    css: [
      [/^\s*(@(?:media|supports|keyframes|font-face|layer|container)[^{]*)\{/, 'type'],
      [/^\s*([^\s@/{}][^{};]*?)\s*\{/, 'selector'],
    ],
    sql: [[/^\s*create\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?(table|view|function|procedure|index|trigger|type|schema|sequence)\s+(?:if\s+not\s+exists\s+)?([\w."`[\]]+)/i, 'sql']],
    yaml: [[/^([A-Za-z_][\w.-]*)\s*:/, 'key']],
    ini: [[/^\s*\[([^\]]+)\]/, 'type']],
    json: [[/^(\s{0,4})"([^"]+)"\s*:\s*[{[]/, 'key']],
    html: [
      [/<(h[1-6])\b[^>]*>(.*?)<\/h[1-6]>/i, 'heading'],
      [/<(script|style)\b/i, 'block'],
      [/<(\w+)\b[^>]*\bid\s*=\s*["']([^"']+)["']/i, 'id'],
    ],
  };

  const FAMILY = {
    javascript: 'js', typescript: 'js', jsx: 'js', tsx: 'js', coffee: 'js', python: 'python',
    java: 'c', kotlin: 'c', c_cpp: 'c', csharp: 'c', dart: 'c', swift: 'c', scala: 'c', groovy: 'c', objectivec: 'c',
    golang: 'go', rust: 'rust', php: 'php', ruby: 'ruby', lua: 'lua', sh: 'sh', markdown: 'markdown',
    css: 'css', scss: 'css', less: 'css', sass: 'css', sql: 'sql', mysql: 'sql', pgsql: 'sql', yaml: 'yaml',
    ini: 'ini', toml: 'ini', properties: 'ini', json: 'json', json5: 'json', html: 'html', xml: 'html', svg: 'html', php_laravel_blade: 'php',
  };

  function outline(mode, text, tabSize) {
    const fam = FAMILY[mode];
    if (!fam) return [];
    const rules = R[fam];
    const lines = text.split('\n');
    const out = [];
    const ts = tabSize || 4;
    const indentOf = s => {
      let n = 0;
      for (const ch of s) { if (ch === ' ') n++; else if (ch === '\t') n += ts; else break; }
      return n;
    };
    let inBlockComment = false;
    for (let row = 0; row < lines.length && out.length < 3000; row++) {
      const ln = lines[row];
      if (ln.length > 400) continue;
      if (fam !== 'markdown' && fam !== 'python' && fam !== 'sh' && fam !== 'yaml' && fam !== 'ini') {
        if (inBlockComment) { if (ln.includes('*/')) inBlockComment = false; continue; }
        if (/^\s*\/\*/.test(ln) && !ln.includes('*/')) { inBlockComment = true; continue; }
        if (/^\s*(\/\/|\*|#(?!include))/.test(ln) && fam !== 'css') continue;
      }
      if (fam === 'markdown' && /^(```|~~~)/.test(ln)) {
        // пропускаємо блоки коду
        const fence = ln.slice(0, 3);
        row++;
        while (row < lines.length && !lines[row].startsWith(fence)) row++;
        continue;
      }
      for (const [re, kind, stop] of rules) {
        const m = re.exec(ln);
        if (!m) continue;
        let name, depth = Math.floor(indentOf(ln) / ts);
        if (kind === 'heading' && fam === 'markdown') { name = m[2]; depth = m[1].length - 1; }
        else if (kind === 'heading') { name = m[2].replace(/<[^>]+>/g, '').trim(); depth = +m[1][1] - 1; }
        else if (kind === 'sql') { name = m[2] + ' (' + m[1].toLowerCase() + ')'; }
        else if (kind === 'block') { name = '<' + m[1].toLowerCase() + '>'; }
        else if (kind === 'id') { name = m[1].toLowerCase() + '#' + m[2]; }
        else if (kind === 'key' && fam === 'json') { name = m[2]; depth = Math.floor(m[1].length / 2); if (depth > 1) continue; }
        else name = m[2] && fam === 'rust' && kind === 'class' ? m[2] + ' (' + m[1].trim() + ')' : m[1];
        if (!name) continue;
        name = name.trim();
        if (stop && stop.has(name)) continue;
        if (kind === 'selector' && (depth > 1 || name.length > 80)) continue;
        out.push({ name, kind, row, depth });
        break;
      }
    }
    // нормалізуємо глибину: мінімальна — нуль
    if (out.length && fam !== 'markdown' && fam !== 'html') {
      const min = Math.min(...out.map(o => o.depth));
      for (const o of out) o.depth = Math.min(4, o.depth - min);
    }
    return out;
  }

  return { ext, badge, badgeEl, detect, caption, extFor, modes, POPULAR, runKind, outline, modelist };
})();
