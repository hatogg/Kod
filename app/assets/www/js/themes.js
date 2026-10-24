'use strict';
/* Власні теми коду «Код темна» і «Код світла» в кольорах інтерфейсу + список вбудованих тем Ace. */

(function defineThemes() {
  const make = (name, cls, dark, c) => {
    const css = `
.${cls} { background-color: ${c.bg}; color: ${c.fg}; }
.${cls} .ace_gutter { background: ${c.bg}; color: ${c.gutter}; }
.${cls} .ace_gutter-active-line { background-color: ${c.line}; color: ${c.gutterActive}; }
.${cls} .ace_print-margin { width: 1px; background: ${c.margin}; }
.${cls} .ace_cursor { color: ${c.cursor}; }
.${cls} .ace_hidden-cursors .ace_cursor { opacity: .4; }
.${cls} .ace_marker-layer .ace_selection { background: ${c.sel}; }
.${cls}.ace_multiselect .ace_selection.ace_start { box-shadow: 0 0 3px 0 ${c.bg}; border-radius: 2px; }
.${cls} .ace_marker-layer .ace_step { background: ${c.step}; }
.${cls} .ace_marker-layer .ace_bracket { margin: -1px 0 0 -1px; border: 1px solid ${c.bracket}; border-radius: 2px; }
.${cls} .ace_marker-layer .ace_active-line { background: ${c.line}; }
.${cls} .ace_marker-layer .ace_selected-word { border: 1px solid ${c.word}; background: ${c.wordBg}; border-radius: 2px; }
.${cls} .ace_marker-layer .kod-search-hl { position: absolute; background: ${c.findSel}; border-radius: 2px; }
.${cls} .ace_marker-layer .ace_selected-word.kod-hide { display: none; }
.${cls} .ace_invisible { color: ${c.invisible}; }
.${cls} .ace_fold { background-color: ${c.fn}; border-color: ${c.fg}; }
.${cls} .ace_indent-guide { background: linear-gradient(90deg, transparent calc(100% - 1px), ${c.guide} calc(100% - 1px)); }
.${cls} .ace_indent-guide-active { background: linear-gradient(90deg, transparent calc(100% - 1px), ${c.guideActive} calc(100% - 1px)); }
.${cls} .ace_keyword, .${cls} .ace_storage, .${cls} .ace_storage.ace_type { color: ${c.kw}; }
.${cls} .ace_keyword.ace_operator { color: ${c.op}; }
.${cls} .ace_keyword.ace_other.ace_unit { color: ${c.num}; }
.${cls} .ace_constant.ace_language, .${cls} .ace_constant.ace_numeric, .${cls} .ace_constant.ace_other,
.${cls} .ace_support.ace_constant { color: ${c.num}; }
.${cls} .ace_constant.ace_character, .${cls} .ace_constant.ace_language.ace_escape { color: ${c.op}; }
.${cls} .ace_support.ace_function { color: ${c.support}; }
.${cls} .ace_support.ace_class, .${cls} .ace_support.ace_type, .${cls} .ace_entity.ace_name.ace_type,
.${cls} .ace_entity.ace_name.ace_class { color: ${c.type}; }
.${cls} .ace_support.ace_type.ace_property, .${cls} .ace_support.ace_type.ace_vendor { color: ${c.support}; }
.${cls} .ace_entity.ace_name.ace_function, .${cls} .ace_support.ace_function.ace_dom { color: ${c.fn}; }
.${cls} .ace_entity.ace_name.ace_tag, .${cls} .ace_meta.ace_tag.ace_tag-name { color: ${c.tag}; }
.${cls} .ace_meta.ace_tag { color: ${c.punct}; }
.${cls} .ace_entity.ace_other.ace_attribute-name { color: ${c.attr}; }
.${cls} .ace_variable { color: ${c.fg}; }
.${cls} .ace_variable.ace_parameter { color: ${c.param}; }
.${cls} .ace_variable.ace_language { color: ${c.tag}; font-style: italic; }
.${cls} .ace_variable.ace_instance, .${cls} .ace_variable.ace_other { color: ${c.param}; }
.${cls} .ace_string { color: ${c.str}; }
.${cls} .ace_string.ace_regexp { color: ${c.regex}; }
.${cls} .ace_comment { color: ${c.comment}; font-style: italic; }
.${cls} .ace_comment.ace_doc.ace_tag { color: ${c.kw}; font-style: normal; }
.${cls} .ace_punctuation, .${cls} .ace_paren, .${cls} .ace_punctuation.ace_operator { color: ${c.punct}; }
.${cls} .ace_heading, .${cls} .ace_markup.ace_heading { color: ${c.fn}; font-weight: bold; }
.${cls} .ace_markup.ace_list { color: ${c.num}; }
.${cls} .ace_markup.ace_underline { text-decoration: underline; }
.${cls} .ace_strong { font-weight: bold; }
.${cls} .ace_emphasis { font-style: italic; }
.${cls} .ace_string.ace_blockquote { color: ${c.comment}; }
.${cls} .ace_support.ace_constant.ace_language, .${cls} .ace_constant.ace_language.ace_boolean { color: ${c.num}; }
.${cls} .ace_meta.ace_selector, .${cls} .ace_entity.ace_other.ace_attribute-name.ace_class { color: ${c.type}; }
.${cls} .ace_xml-pe, .${cls} .ace_doctype { color: ${c.comment}; }
.${cls} .ace_invalid { color: #fff; background-color: ${c.invalid}; }
.${cls} .ace_invalid.ace_deprecated { color: ${c.bg}; background-color: ${c.num}; }
.${cls} .ace_gutter-layer > .kod-bm { background: ${c.bm}; color: ${c.bmInk}; border-radius: 0 9px 9px 0; }
.${cls} .ace_gutter-layer > .kod-bm::before { content: ''; position: absolute; left: 3px; top: 50%; width: 5px; height: 5px; margin-top: -2.5px; border-radius: 50%; background: ${c.bmInk}; }
.${cls} .kod-find-range { position: absolute; background: ${c.rangeBg}; border-top: 1px dashed ${c.word}; border-bottom: 1px dashed ${c.word}; }
.${cls} .kod-hl-line { position: absolute; background: ${c.findSel}; }
`;
    ace.define('ace/theme/' + name, ['require', 'exports', 'module', 'ace/lib/dom'], function (require, exports) {
      exports.isDark = dark;
      exports.cssClass = cls;
      exports.cssText = css;
      require('ace/lib/dom').importCssString(css, cls, false);
    });
  };

  make('kod_dark', 'ace-kod-dark', true, {
    bg: '#15171c', fg: '#d5dae6', gutter: '#4b5366', gutterActive: '#aab3c5', line: '#1b1e25',
    margin: '#242833', cursor: '#8aa4ff', sel: '#2a3456', step: '#4a3f12', bracket: '#66729a',
    word: '#3e4a72', wordBg: 'rgba(138,164,255,.07)', findSel: 'rgba(255,199,119,.22)', invisible: '#353b4a',
    guide: '#242833', guideActive: '#3b4257', kw: '#c099ff', op: '#89ddff', num: '#ff9e64', support: '#7dcfff',
    type: '#ffc777', fn: '#82aaff', tag: '#ff757f', attr: '#c099ff', param: '#e0af68', str: '#a3d977',
    regex: '#b4f9f8', comment: '#626e8f', punct: '#9aa5c5', invalid: '#c53b53', bm: '#8aa4ff', bmInk: '#101425',
    rangeBg: 'rgba(138,164,255,.06)',
  });

  make('kod_light', 'ace-kod-light', false, {
    bg: '#ffffff', fg: '#1f2430', gutter: '#a3abb9', gutterActive: '#414a5c', line: '#f4f6fa',
    margin: '#e9ecf1', cursor: '#3b5bdb', sel: '#d6e0ff', step: '#fff2b3', bracket: '#97a3c4',
    word: '#b7c5f2', wordBg: 'rgba(59,91,219,.06)', findSel: 'rgba(250,176,5,.28)', invisible: '#d3d8e0',
    guide: '#eef0f4', guideActive: '#cfd5e0', kw: '#8b3fd9', op: '#0b7aa8', num: '#c2410c', support: '#0b7aa8',
    type: '#a35b00', fn: '#2453d6', tag: '#c0264b', attr: '#8b3fd9', param: '#b45309', str: '#1d7a38',
    regex: '#0e7c86', comment: '#8a93a5', punct: '#5b6476', invalid: '#e03131', bm: '#3b5bdb', bmInk: '#ffffff',
    rangeBg: 'rgba(59,91,219,.05)',
  });
})();

/** [id, назва, темна] */
const THEMES = [
  ['kod_dark', 'Код темна', true],
  ['kod_light', 'Код світла', false],
  ['one_dark', 'One Dark', true],
  ['monokai', 'Monokai', true],
  ['dracula', 'Dracula', true],
  ['tomorrow_night', 'Tomorrow Night', true],
  ['tomorrow_night_eighties', 'Tomorrow Night 80s', true],
  ['github_dark', 'GitHub Dark', true],
  ['nord_dark', 'Nord', true],
  ['solarized_dark', 'Solarized Dark', true],
  ['gruvbox', 'Gruvbox', true],
  ['cloud9_night', 'Cloud9 Night', true],
  ['twilight', 'Twilight', true],
  ['cobalt', 'Cobalt', true],
  ['merbivore_soft', 'Merbivore Soft', true],
  ['vibrant_ink', 'Vibrant Ink', true],
  ['github_light_default', 'GitHub Light', false],
  ['xcode', 'Xcode', false],
  ['chrome', 'Chrome', false],
  ['eclipse', 'Eclipse', false],
  ['crimson_editor', 'Crimson Editor', false],
  ['solarized_light', 'Solarized Light', false],
  ['tomorrow', 'Tomorrow', false],
  ['dawn', 'Dawn', false],
  ['sqlserver', 'SQL Server', false],
  ['katzenmilch', 'Katzenmilch', false],
];
