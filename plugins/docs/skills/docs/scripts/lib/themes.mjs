// The three document themes, shared by the HTML/PDF and Word renderers so both look alike.
// Sizes are points; colors hex without '#'.

const SANS_WEB =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';
const SERIF_WEB =
  'Charter, "Iowan Old Style", Georgia, "Times New Roman", "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", "Noto Serif SC", serif';
const MONO_WEB = '"SF Mono", Menlo, Consolas, "Liberation Mono", "Noto Sans Mono CJK SC", monospace';

export const THEMES = {
  modern: {
    label: 'Modern',
    web: { body: SANS_WEB, heading: SANS_WEB, mono: MONO_WEB },
    word: { body: 'Calibri', heading: 'Calibri', bodyEa: 'Microsoft YaHei', headingEa: 'Microsoft YaHei', mono: 'Consolas' },
    size: { body: 11, bodyZh: 10.5, title: 26, subtitle: 13, h1: 17, h2: 13.5, h3: 11.5, h4: 11, code: 9.5, small: 9 },
    line: 1.45,
    color: { text: '1F2328', muted: '59636E', accent: '2B5B84', heading: '1B2A3A', rule: 'D5DAE0', codeBg: 'F3F4F6', headBg: 'EEF2F6' },
    marginMm: 22,
  },
  classic: {
    label: 'Classic',
    web: { body: SERIF_WEB, heading: SERIF_WEB, mono: MONO_WEB },
    word: { body: 'Georgia', heading: 'Georgia', bodyEa: 'SimSun', headingEa: 'SimHei', mono: 'Consolas' },
    size: { body: 11.5, bodyZh: 12, title: 24, subtitle: 13, h1: 16, h2: 13, h3: 12, h4: 11.5, code: 9.5, small: 9 },
    line: 1.5,
    color: { text: '1A1A1A', muted: '5C5C5C', accent: '1A1A1A', heading: '111111', rule: 'C9C9C9', codeBg: 'F4F3F0', headBg: 'F0EEE9' },
    marginMm: 25,
  },
  memo: {
    label: 'Memo',
    web: { body: SANS_WEB, heading: SANS_WEB, mono: MONO_WEB },
    word: { body: 'Arial', heading: 'Arial', bodyEa: 'Microsoft YaHei', headingEa: 'Microsoft YaHei', mono: 'Consolas' },
    size: { body: 10.5, bodyZh: 10.5, title: 18, subtitle: 11.5, h1: 13.5, h2: 11.5, h3: 10.5, h4: 10.5, code: 9, small: 8.5 },
    line: 1.35,
    color: { text: '222222', muted: '666666', accent: '0F5F4A', heading: '111111', rule: 'D6D6D6', codeBg: 'F4F4F4', headBg: 'EFEFEF' },
    marginMm: 18,
  },
};

export const CALLOUTS = {
  note: { color: '2F6FB0', bg: 'EEF4FB', en: 'Note', zh: '说明' },
  tip: { color: '2E7D4F', bg: 'EEF7F1', en: 'Tip', zh: '提示' },
  important: { color: '6E4BB5', bg: 'F3EFFA', en: 'Important', zh: '重要' },
  warning: { color: '9A6700', bg: 'FBF5E6', en: 'Warning', zh: '警告' },
  caution: { color: 'B42318', bg: 'FCEFEE', en: 'Caution', zh: '注意' },
};

export const PAGE = {
  A4: { widthMm: 210, heightMm: 297, css: 'A4' },
  Letter: { widthMm: 215.9, heightMm: 279.4, css: 'letter' },
};

export const isZh = (lang) => /^(zh|ja|ko)/i.test(lang);

export const words = (lang) =>
  isZh(lang)
    ? { contents: '目录', footnotes: '注释', page: (n, t) => `${n} / ${t}` }
    : { contents: 'Contents', footnotes: 'Notes', page: (n, t) => `${n} / ${t}` };
