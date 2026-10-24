'use strict';
/*
 * Форматування C-подібних мов (JavaScript, TypeScript, Java, C/C++, C#, Kotlin, Go, Rust, Swift, Dart)
 * за токенами підсвітки Ace: фігурні дужки й відступи, перенос після «;», пробіли біля «,», «=»,
 * ключових слів. Рядки, коментарі й регулярні вирази не змінюються. Авторські переноси рядків
 * зберігаються (не більше одного порожнього рядка поспіль).
 */
const Fmt = {
  MODES: new Set(['javascript', 'typescript', 'java', 'c_cpp', 'csharp', 'kotlin', 'golang', 'rust', 'swift', 'dart', 'scala', 'groovy', 'objectivec', 'json5', 'actionscript', 'd', 'haxe', 'vala', 'zig']),
  ASSIGN: new Set(['=', '==', '===', '!=', '!==', '+=', '-=', '*=', '/=', '%=', '**=', '&&', '||', '??', '=>', '<=', '>=', '|=', '&=', '^=', '<<=', '>>=', '>>>=', '??=', '||=', '&&=', '->', ':=', '<-', '<=>']),
  KW_PAREN: new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'return', 'typeof', 'await', 'function', 'foreach', 'using', 'lock', 'when', 'yield', 'in', 'of', 'instanceof', 'new', 'delete', 'void', 'throw', 'case', 'match', 'loop', 'guard', 'elif', 'else', 'do', 'try', 'finally', 'synchronized', 'fixed', 'sizeof', 'and', 'or', 'not', 'is', 'as', 'unless', 'go', 'defer', 'select', 'range']),
  JOIN: new Set(['else', 'catch', 'finally', 'while']),
  UNARY_PREV: new Set(['(', '[', '{', ',', ';', ':', '?', '=', '==', '===', '!=', '!==', '+', '-', '*', '/', '%', '&&', '||', '??', '!', '~', 'return', 'typeof', 'case', '=>', '<', '>', '<=', '>=', '&', '|', '^', 'throw', 'yield', 'await', 'in', 'of', 'delete', 'void', '+=', '-=', '*=', '/=', '${']),
  NOSP_AFTER: new Set(['(', '[', '.', '?.', '!', '~', '...', '::', '@', '#', '${']),

  supports(mode) { return Fmt.MODES.has(mode); },

  code(session) {
    const unit = session.getUseSoftTabs() ? ' '.repeat(session.getTabSize()) : '\t';
    const rows = session.getLength();
    const cpp = /c_cpp|csharp|objectivec/.test(session.$modeId || '');
    const special = t => /string|comment|regexp|quasi|heredoc|escape/.test(t.type);
    const kind = type => /comment/.test(type) ? 'c' : 's';

    // ---- плаский потік токенів з позначками кінця рядка
    const toks = [];
    for (let r = 0; r < rows; r++) {
      const line = session.getLine(r);
      if (cpp && /^\s*#/.test(line)) toks.push({ type: 'raw', value: line.trim() });
      else for (const t of session.getTokens(r)) toks.push({ type: t.type, value: t.value });
      if (r < rows - 1) {
        // рядок закінчується всередині багаторядкового рядка чи блочного коментаря?
        const state = session.getState(r);
        const s = Array.isArray(state) ? state.join(' ') : String(state || '');
        toks.push({ type: 'nl', inside: /comment|string|qqstring|qstring|quasi|heredoc|doc/i.test(s) && !/^(start|no_regex)$/.test(s) });
      }
    }

    const out = [];
    let cur = null, raw = false, prev = null, sp0 = false, ws = false, auto = false, first = null, inRe = false;
    const stack = [], terns = [];
    const mode = (session.$modeId || '').replace('ace/mode/', '');
    const js = mode === 'javascript' || mode === 'json5';
    const jsLike = js || mode === 'typescript';
    // бінарні оператори, біля яких завжди ставимо пробіли (у JS немає узагальнень <T>)
    const BIN = js ? new Set(['+', '-', '*', '%', '<', '>', '&', '|', '^', '<<', '>>', '>>>', '**', 'instanceof'])
      : mode === 'golang' ? new Set(['+', '-', '/', '%', '<', '>', '|', '^', '<<', '>>'])
        : new Set(['+', '-', '/', '%']);
    const LITERAL_PREV = new Set(['=', ',', '(', '[', ':', 'return', '?', '??', '||', '&&', 'yield', 'await', '...', '!', 'in', 'of']);
    const level = () => stack.reduce((n, s) => n + (s.broke ? 1 : 0) + (s.caseBody ? 1 : 0), 0);
    const flush = (isAuto) => { if (cur !== null) { out.push(cur.join('').replace(/\s+$/, '')); cur = null; auto = !!isAuto; first = null; } };
    const brk = () => flush(true);
    const blankLine = () => { if (cur === null && out.length && out[out.length - 1] !== '') out.push(''); };
    const write = (v, sp, extra) => {
      auto = false;
      if (cur === null) {
        first = v;
        if (raw) { cur = [v]; raw = false; return; }
        const top = stack[stack.length - 1];
        if (top && top.caseBody && (v === 'case' || v === 'default')) extra = (extra || 0) - 1;
        cur = [unit.repeat(Math.max(0, level() + (extra || 0))), v];
      } else cur.push(sp ? ' ' + v : v);
    };
    const inline = () => stack.length && stack[stack.length - 1].inline;
    const topIs = ch => stack.length && stack[stack.length - 1].ch === ch;
    const nlAfter = i => toks[i + 1] && (toks[i + 1].type === 'nl' || (/^\s*$/.test(toks[i + 1].value) && toks[i + 2] && toks[i + 2].type === 'nl'));
    const nextSig = i => {
      for (let j = i + 1; j < toks.length; j++) {
        const t = toks[j];
        if (t.type === 'nl' || /^\s*$/.test(t.value) || /comment/.test(t.type)) continue;
        return t;
      }
      return null;
    };
    const sameLineComment = i => {
      for (let j = i + 1; j < toks.length; j++) {
        const t = toks[j];
        if (t.type === 'nl') return false;
        if (/^\s*$/.test(t.value)) continue;
        return /comment/.test(t.type);
      }
      return false;
    };
    const isWord = p => p && /^[\w$@#"'`]/.test(p.v) && !Fmt.ASSIGN.has(p.v);
    const spaceBefore = (p, type) => {
      if (cur === null || !prev) return false;
      if (Fmt.NOSP_AFTER.has(prev.v) || prev.t === 'unary') return false;
      if ((prev.v === ')' || prev.v === ']') && /^[\w$"'`]/.test(p)) return true;
      if (prev.t === 'bin' || BIN.has(p) && prev.t !== 'unary') return true;
      if (/quasi/.test(type) && /quasi/.test(prev.t)) return false;
      if (/^[)\],;]$/.test(p) || p === '.' || p === '?.') return false;
      if (/comment/.test(type)) return true;
      if (prev.v === ',' || prev.v === ';' || prev.v === ':' || prev.v === '?' || Fmt.ASSIGN.has(prev.v)) return true;
      return sp0;
    };

    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      const v = t.value;
      if (t.type === 'nl') {
        if (t.inside) { flush(); raw = true; sp0 = false; continue; }
        if (cur === null) { if (auto) auto = false; else blankLine(); } else flush();
        const top = stack[stack.length - 1];
        if (top && top.fresh) top.broke = true;
        sp0 = false;
        continue;
      }
      if (t.type === 'raw') { flush(); out.push(v); prev = null; continue; }
      if (raw) { write(v, false); prev = { v: v.trim(), t: t.type }; sp0 = false; ws = false; continue; }
      if (stack.length) stack[stack.length - 1].fresh = false;

      // регулярний вираз /…/ переписуємо як є, хоч Ace і ділить його на дрібні токени
      if (inRe) {
        write(v, false);
        if (t.type === 'string.regexp' && /\/[a-z]*$/.test(v)) inRe = false;
        prev = { v, t: 'string.regexp' };
        sp0 = false; ws = false;
        continue;
      }
      if (t.type === 'string.regexp' && v[0] === '/' && !/^\/.+\/[a-z]*$/.test(v)) {
        write(v, spaceBefore(v, t.type) || (ws && cur !== null));
        inRe = true;
        prev = { v, t: 'string.regexp' };
        sp0 = false; ws = false;
        continue;
      }
      // продовження рядка чи коментаря — переписуємо як є
      if (special(t) && !/paren/.test(t.type) && prev && cur !== null && !ws && prev.t && special({ type: prev.t }) && !/paren/.test(prev.t) && kind(t.type) === kind(prev.t)) {
        write(v, false);
        prev = { v: v.trim() || prev.v, t: t.type };
        sp0 = false;
        continue;
      }
      if (/^\s+$/.test(v)) { sp0 = true; ws = true; continue; }
      ws = false;
      if (special(t) && !/paren/.test(t.type)) {
        const val = v.replace(/^\s+/, '');
        write(val, spaceBefore(val, t.type) || (/^\s/.test(v) && cur !== null && !/quasi/.test(t.type)));
        prev = { v: val.trim(), t: t.type };
        sp0 = false;
        continue;
      }

      const parts = /^[()[\]{};,]+$/.test(v) && v.length > 1 ? v.split('') : [v.trim()];
      if (/^\s/.test(v)) sp0 = true;
      for (let pi = 0; pi < parts.length; pi++) {
        const p = parts[pi];
        const quasi = /quasi/.test(t.type);
        const prevDot = prev && (prev.v === '.' || prev.v === '?.');
        if (p === '{' && !quasi) {
          const nx = nextSig(i);
          const sp = cur !== null && prev && !Fmt.NOSP_AFTER.has(prev.v);
          const emptyHere = parts[pi + 1] === '}';
          if (emptyHere || (nx && nx.value.trim()[0] === '}' && pi === parts.length - 1)) {
            write('{}', sp);
            if (emptyHere) pi++;
            else {
              const j = toks.indexOf(nx, i);
              const rest = nx.value.trim().slice(1);
              if (rest) { nx.value = rest; i = j - 1; } else i = j;
            }
            prev = { v: '}', t: 'paren' };
            const after = nextSig(i);
            const av = after ? after.value.trim() : '';
            if (after && Fmt.JOIN.has(av)) sp0 = true;
            else if (!after || !/^[)\],;.?:]/.test(av)) brk();
            continue;
          }
          const literal = !prev || LITERAL_PREV.has(prev.v) || (prev.t === 'op' && prev.v !== '=>');
          if (literal && !nlAfter(i)) {
            write('{', sp);
            stack.push({ ch: '{', broke: false, inline: true });
            prev = { v: '{', t: 'paren' };
            sp0 = true;
            continue;
          }
          write('{', sp);
          stack.push({ ch: '{', broke: true, lit: literal });
          if (sameLineComment(i)) sp0 = true; else brk();
          prev = { v: '{', t: 'paren' };
          if (cur === null) sp0 = false;
          continue;
        }
        if ((p === '}' && !quasi) || p === ')' || p === ']') {
          const open = { '}': '{', ')': '(', ']': '[' }[p];
          const wasInline = p === '}' && inline();
          if (p === '}' && cur !== null && !wasInline) flush();
          let k = stack.length - 1;
          while (k >= 0 && stack[k].ch !== open) k--;
          if (k >= 0) stack.splice(k);
          while (terns.length && terns[terns.length - 1] > stack.length) terns.pop();
          write(p, wasInline);
          prev = { v: p, t: 'paren' };
          sp0 = false;
          if (p === '}' && !wasInline) {
            const nx = pi < parts.length - 1 ? { value: parts[pi + 1] } : nextSig(i);
            const nv = nx ? nx.value.trim() : '';
            if (nx && Fmt.JOIN.has(nv)) sp0 = true;
            else if (!nx || !/^[)\],;.?:]/.test(nv)) { if (sameLineComment(i)) sp0 = true; else brk(); }
          }
          continue;
        }
        if (p === '(' || p === '[') {
          let sp = false;
          if (cur !== null && prev && !Fmt.NOSP_AFTER.has(prev.v) && prev.t !== 'unary') {
            if (prev.afterDot) sp = false;
            else if (Fmt.KW_PAREN.has(prev.v) || Fmt.ASSIGN.has(prev.v) || prev.t === 'bin' || [',', ':', '?', ';'].includes(prev.v)) sp = true;
            else if (isWord(prev) || prev.v === ')' || prev.v === ']') sp = false;
            else sp = sp0;
          }
          write(p, sp);
          stack.push({ ch: p, broke: false, fresh: true });
          prev = { v: p, t: 'paren' };
          sp0 = false;
          continue;
        }
        if (p === ';') {
          write(';', false);
          prev = { v: ';', t: 'punct' };
          sp0 = false;
          if (!topIs('(') && !inline()) { if (sameLineComment(i)) sp0 = true; else brk(); } else sp0 = true;
          continue;
        }
        if (p === ',') {
          write(',', false);
          prev = { v: ',', t: 'punct' };
          sp0 = true;
          const top = stack[stack.length - 1];
          if (top && top.ch === '{' && top.lit && !top.inline && !sameLineComment(i)) brk();
          continue;
        }
        if (p === '.' || p === '?.' || p === '::') {
          write(p, false, cur === null ? 1 : 0);
          prev = { v: p, t: 'punct' };
          sp0 = false;
          continue;
        }
        if (p === '?' && !quasi) {
          const nx = nextSig(i);
          const nv = nx ? nx.value.trim() : '';
          const tern = !/^[:),=>;\].?]/.test(nv) && mode !== 'kotlin' && (sp0 || jsLike || /java|c_cpp|objectivec|csharp|dart/.test(mode));
          if (tern) terns.push(stack.length);
          write('?', tern && cur !== null);
          prev = { v: '?', t: tern ? 'bin' : 'unary' };
          sp0 = tern;
          continue;
        }
        if (p === ':' && !quasi) {
          if (toks[i + 1] && toks[i + 1].value === '=' ) {
            i++;
            write(':=', cur !== null);
            prev = { v: ':=', t: 'bin' };
            sp0 = true;
            continue;
          }
          const tern = terns.length && terns[terns.length - 1] === stack.length;
          if (tern) terns.pop();
          write(':', !!tern);
          prev = { v: ':', t: 'punct' };
          sp0 = true;
          if (!tern && (first === 'case' || first === 'default') && !inline() && topIs('{')) {
            const top = stack[stack.length - 1];
            if (top) top.caseBody = true;
            brk();
          }
          continue;
        }
        if (Fmt.ASSIGN.has(p)) {
          write(p, cur !== null);
          prev = { v: p, t: p === '=>' ? 'arrow' : 'op' };
          sp0 = true;
          continue;
        }
        if (p === '!' || p === '~' || p === '++' || p === '--' || p === '...' || ((p === '-' || p === '+' || (js && p === '*' && false)) && (!prev || Fmt.UNARY_PREV.has(prev.v) || prev.t === 'bin' || prev.t === 'op'))) {
          const postfix = (p === '++' || p === '--') && prev && (isWord(prev) || prev.v === ')' || prev.v === ']') && !sp0;
          let sp = false;
          if (!postfix && cur !== null && prev && !Fmt.NOSP_AFTER.has(prev.v) && prev.t !== 'unary') {
            sp = Fmt.ASSIGN.has(prev.v) || [',', ':', '?', ';'].includes(prev.v) || Fmt.KW_PAREN.has(prev.v) || sp0;
          }
          write(p, sp);
          prev = { v: p, t: postfix ? 'word' : 'unary' };
          sp0 = false;
          continue;
        }
        const cmp = (p === '<' || p === '>') && !BIN.has(p) && ((toks[i + 1] && /^\d/.test(toks[i + 1].value)) || (prev && /^\d/.test(prev.v)));
        if (BIN.has(p) || cmp) {
          write(p, cur !== null);
          prev = { v: p, t: 'bin' };
          sp0 = true;
          continue;
        }
        write(p, spaceBefore(p, t.type));
        prev = { v: p, t: t.type, afterDot: !!(prevDot) };
        sp0 = false;
      }
    }
    flush();
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n') + '\n';
  },

  /** Літерали (рядки, регулярні вирази, коментарі) у порядку появи — для перевірки, що їх не змінено. */
  literals(session, text) {
    const tmp = ace.createEditSession(text, session.getMode());
    const parts = [];
    for (let r = 0, n = tmp.getLength(); r < n; r++) {
      for (const t of tmp.getTokens(r)) if (/string|regexp|comment|escape|quasi|xml|tag/.test(t.type)) parts.push(t.value.trim());
    }
    tmp.destroy && tmp.destroy();
    return parts.filter(Boolean).join('\u0000');
  },

  /** Чи безпечний результат: змінилися лише пробіли поза літералами. */
  safe(session, before, after) {
    const strip = x => x.replace(/\s+/g, '');
    if (strip(before) !== strip(after)) return false;
    return Fmt.literals(session, before) === Fmt.literals(session, after);
  },

  /** Запасний варіант: лише вирівняти відступи за дужками, не чіпаючи вмісту рядків. */
  reindent(session) {
    const unit = session.getUseSoftTabs() ? ' '.repeat(session.getTabSize()) : '\t';
    const out = [];
    let depth = 0, insidePrev = false;
    for (let r = 0, n = session.getLength(); r < n; r++) {
      const line = session.getLine(r);
      const toks = session.getTokens(r);
      if (insidePrev) out.push(line);
      else {
        let lead = 0;
        for (const t of toks) {
          const v = t.value.trim();
          if (!v) continue;
          if (/paren\.rparen/.test(t.type) && !/quasi/.test(t.type)) { lead += v.length; continue; }
          break;
        }
        const d = Math.max(0, depth - lead);
        out.push(line.trim() ? unit.repeat(d) + line.trim() : '');
      }
      for (const t of toks) {
        if (/quasi/.test(t.type)) continue;
        if (/paren\.lparen/.test(t.type)) depth += t.value.trim().length;
        else if (/paren\.rparen/.test(t.type)) depth = Math.max(0, depth - t.value.trim().length);
      }
      const st = session.getState(r);
      const sv = Array.isArray(st) ? st.join(' ') : String(st || '');
      insidePrev = /comment|string|quasi|heredoc|doc/i.test(sv) && !/^(start|no_regex)$/.test(sv);
    }
    return out.join('\n');
  },
};
