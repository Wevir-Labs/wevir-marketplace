// Static checks on a deck's source file: markup, the slide subset, files it names. Line-numbered.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ICONS } from './icons.mjs';

const VOID = new Set(['img', 'br', 'hr', 'meta', 'link', 'input', 'source', 'wbr', 'col', 'area', 'base', 'embed', 'track']);
const SLIDE_TAGS = new Set([
  'h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'br', 'b', 'i', 'u', 's', 'strong', 'em', 'a', 'span', 'code', 'sup', 'sub',
  'div', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'svg', 'hr', 'aside', 'x-shape', 'x-icon', 'x-connector',
]);
const FORBIDDEN = {
  script: 'scripts never run in a deck',
  iframe: 'not supported; use an image',
  object: 'not supported',
  embed: 'not supported',
  canvas: 'not supported; use <svg> or an image',
  form: 'not supported',
  input: 'not supported',
  button: 'not supported',
  video: 'not supported yet; use a still image',
  audio: 'not supported',
  'x-embed': 'not supported in Wevir Slides',
};
const SHAPES = new Set(['rect', 'rounded', 'ellipse', 'diamond', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'line']);
const CSS_ALLOWED = new Set(
  `position left top right bottom width height min-width min-height max-width max-height display flex-direction
  flex-wrap gap row-gap column-gap align-items justify-content justify-items align-self justify-self flex flex-grow
  flex-shrink flex-basis grid-template-columns grid-template-rows grid-column grid-row aspect-ratio padding
  padding-top padding-right padding-bottom padding-left overflow font-family font-size font-weight font-style font
  line-height letter-spacing text-align text-transform white-space text-decoration text-decoration-color
  text-underline-offset font-variant-numeric font-feature-settings -webkit-text-stroke color background
  background-color background-clip -webkit-background-clip -webkit-text-fill-color border border-top border-right
  border-bottom border-left border-width border-style border-color border-radius box-shadow text-shadow opacity
  transform transform-origin filter backdrop-filter -webkit-backdrop-filter mix-blend-mode object-fit object-position
  text-wrap word-break overflow-wrap line-break vertical-align list-style list-style-type stroke-width`.split(/\s+/),
);
const CSS_ADVICE = {
  margin: 'no margin in slides: use gap, padding or an empty flex:1 spacer',
  'margin-top': 'no margin in slides: use gap, padding or an empty flex:1 spacer',
  'margin-bottom': 'no margin in slides: use gap, padding or an empty flex:1 spacer',
  'margin-left': 'no margin in slides: use gap, padding or an empty flex:1 spacer',
  'margin-right': 'no margin in slides: use gap, padding or an empty flex:1 spacer',
  'z-index': 'no z-index: later elements paint on top, so order the HTML',
  float: 'no float: use a flex row',
  transition: 'no CSS motion: use data-transition and data-build-in',
  animation: 'no CSS motion: use data-transition and data-build-in',
};

/** Splits HTML into tags and text with offsets; skips comments; keeps raw contents of script/style/svg. */
export function tokenize(html) {
  const tokens = [];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/?([a-zA-Z][\w:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/gi;
  let last = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m.index > last) tokens.push({ type: 'text', text: html.slice(last, m.index), at: last });
    last = re.lastIndex;
    if (m[0].startsWith('<!')) continue;
    const name = m[1].toLowerCase();
    const closing = m[0][1] === '/';
    tokens.push({ type: closing ? 'close' : 'open', name, attrs: parseAttrs(m[2] || ''), selfClose: m[3] === '/', at: m.index, raw: m[0] });
    if (!closing && (name === 'script' || name === 'style')) {
      const end = html.toLowerCase().indexOf(`</${name}`, last);
      const stop = end < 0 ? html.length : end;
      tokens.push({ type: 'raw', text: html.slice(last, stop), at: last });
      re.lastIndex = last = stop;
    }
  }
  if (last < html.length) tokens.push({ type: 'text', text: html.slice(last), at: last });
  return tokens;
}

export function parseAttrs(text) {
  const attrs = {};
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(text))) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return attrs;
}

/** `prop: value` pairs of an inline style. */
export function parseStyle(style) {
  const out = [];
  for (const part of style.split(/;(?![^(]*\))/)) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    const value = part.slice(i + 1).trim();
    if (prop) out.push([prop, value]);
  }
  return out;
}

const lineOf = (html) => {
  const starts = [0];
  for (let i = 0; i < html.length; i++) if (html[i] === '\n') starts.push(i + 1);
  return (at) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= at) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
};

const isRemote = (url) => /^(https?:)?\/\//i.test(url);
const decodeEntities = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/**
 * Lints a deck source.
 * @returns {{ problems: {level: 'error'|'warn'|'note', line: number, slide?: string, message: string}[], slides: number, title: string|null }}
 */
export function lintDeck(html, file) {
  const dir = path.dirname(file);
  const line = lineOf(html);
  const problems = [];
  const add = (level, at, message, slide) => problems.push({ level, line: line(at), ...(slide && { slide }), message });

  const tokens = tokenize(html);
  const stack = [];
  const ids = new Set();
  let slide = null; // { id, at, elements, hasAside, asideAt, lastChildAt }
  let slideCount = 0;
  let inHead = false;
  let sawHtmlLang = false;
  let title = null;
  let divDepth = 0;
  let maxDiv = 0;
  let svgDepth = 0;

  const finishSlide = (at) => {
    if (!slide) return;
    if (slide.elements > 200) add('warn', slide.at, `${slide.elements} elements on one slide; split it or simplify`, slide.id);
    if (slide.asideCount > 1) add('warn', slide.at, 'more than one <aside>; speaker notes are one <aside>', slide.id);
    if (slide.asideCount && slide.contentAfterAside) add('warn', slide.asideAt, 'the <aside> (speaker notes) must be the last child of its section', slide.id);
    if (slide.notesLength > 4000) add('warn', slide.asideAt, `speaker notes are ${slide.notesLength} characters; keep them under 4,000`, slide.id);
    if (!slide.hasBackground) add('warn', slide.at, 'the section sets no background; set one on every slide', slide.id);
    slide = null;
    void at;
  };

  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t];
    if (tok.type === 'raw') {
      const owner = stack[stack.length - 1];
      if (owner === 'style') {
        const rules = tok.text.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        const nonFace = rules.replace(/@font-face\s*\{[^}]*\}/g, '').trim();
        if (nonFace) add('warn', tok.at, '<style> holds rules other than @font-face; keep styles inline on each element');
        for (const m of rules.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
          const url = m[1];
          if (isRemote(url)) add('error', tok.at, `@font-face loads ${url} from the network; use a Google Fonts <link> or a font file beside the deck`);
          else if (!url.startsWith('data:') && !existsSync(path.resolve(dir, decodeURIComponent(url)))) add('error', tok.at, `font file not found: ${url}`);
        }
      }
      continue;
    }
    if (tok.type === 'text') {
      if (slide && slide.inAside) slide.notesLength += tok.text.trim().length;
      else if (slide && tok.text.trim() && stack[stack.length - 1] === 'section') slide.looseText = true;
      if (slide && slide.asideCount && !slide.inAside && tok.text.trim()) slide.contentAfterAside = true;
      if (inHead && stack[stack.length - 1] === 'title') title = (title ?? '') + tok.text.trim();
      continue;
    }
    const { name, attrs } = tok;
    if (tok.type === 'close') {
      const idx = stack.lastIndexOf(name);
      if (idx < 0) {
        if (!VOID.has(name)) add('error', tok.at, `</${name}> closes nothing`);
        continue;
      }
      for (let k = stack.length - 1; k > idx; k--) {
        if (svgDepth === 0 || stack[k] === 'svg') add('error', tok.at, `<${stack[k]}> is not closed before </${name}>`);
      }
      const closed = stack.splice(idx);
      for (const c of closed) {
        if (c === 'div') divDepth--;
        if (c === 'svg') svgDepth--;
      }
      if (name === 'head') inHead = false;
      if (name === 'aside' && slide) slide.inAside = false;
      if (name === 'section') finishSlide(tok.at);
      continue;
    }

    // Opening tag.
    for (const [k, v] of Object.entries(attrs)) {
      if (/^on/.test(k)) add('error', tok.at, `${k}= on <${name}>: event handlers never run`);
      if ((k === 'href' || k === 'src') && /^\s*javascript:/i.test(v)) add('error', tok.at, `javascript: URL on <${name}>`);
    }
    if (name === 'html' && attrs.lang) sawHtmlLang = true;
    if (name === 'head') inHead = true;

    if (FORBIDDEN[name] && svgDepth === 0) add('error', tok.at, `<${name}>: ${FORBIDDEN[name]}`);
    if (name === 'script' && svgDepth > 0) add('error', tok.at, '<script> inside an <svg>: scripts never run in a deck');

    if (name === 'link') {
      const href = decodeEntities(attrs.href ?? '');
      if ((attrs.rel ?? '').includes('stylesheet') && !href.startsWith('https://fonts.googleapis.com/css2?')) {
        add('error', tok.at, `<link> to ${href}: only Google Fonts css2 links are allowed`);
      }
    }

    if (name === 'section') {
      if (slide) add('error', tok.at, 'a <section> inside another section');
      finishSlide(tok.at);
      slideCount++;
      const id = attrs.id;
      if (!id) add('error', tok.at, `slide ${slideCount} has no id`);
      else if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) add('error', tok.at, `slide id "${id}": use letters, digits, - and _ (64 at most)`);
      else if (ids.has(id)) add('error', tok.at, `slide id "${id}" is used twice`);
      if (id) ids.add(id);
      slide = {
        id: id || `#${slideCount}`,
        at: tok.at,
        elements: 0,
        asideCount: 0,
        inAside: false,
        notesLength: 0,
        contentAfterAside: false,
        hasBackground: /(^|;)\s*background(-color|-image)?\s*:/.test(attrs.style ?? ''),
      };
    } else if (slide) {
      if (svgDepth === 0) {
        slide.elements++;
        if (slide.asideCount && !slide.inAside && name !== 'aside') slide.contentAfterAside = true;
        if (!SLIDE_TAGS.has(name) && !FORBIDDEN[name]) add('warn', tok.at, `<${name}> is not in the slide subset`, slide.id);
        if (attrs.class !== undefined) add('note', tok.at, `class= on <${name}> matches nothing: there is no stylesheet; style inline`, slide.id);
        if (name === 'aside') {
          slide.asideCount++;
          slide.inAside = true;
          slide.asideAt = tok.at;
        }
        if (name === 'style') add('error', tok.at, '<style> inside a slide; styles go inline', slide.id);
      }
      if (name === 'img') {
        const src = decodeEntities(attrs.src ?? '');
        if (attrs.alt === undefined) add('warn', tok.at, '<img> without alt; describe what it shows (alt="" if decorative)', slide.id);
        if (!src) {
          // An empty frame: allowed, reported by check.
        } else if (isRemote(src)) {
          add('error', tok.at, `image from the network (${src}); save it beside the deck and use its file name`, slide.id);
        } else if (src.startsWith('data:')) {
          add('note', tok.at, 'a data: URI image; prefer a file beside the deck (the build inlines it)', slide.id);
        } else if (!existsSync(path.resolve(dir, decodeURIComponent(src.split(/[?#]/)[0])))) {
          add('error', tok.at, `image not found: ${src}`, slide.id);
        }
      }
      if (name === 'x-icon') {
        if (!ICONS[attrs.name]) add('error', tok.at, `<x-icon name="${attrs.name ?? ''}">: unknown icon (see reference/format.md for the list)`, slide.id);
      }
      if (name === 'x-shape' && attrs.kind && !SHAPES.has(attrs.kind)) {
        add('error', tok.at, `<x-shape kind="${attrs.kind}">: use ${[...SHAPES].join(', ')}`, slide.id);
      }
      if (name === 'x-connector') {
        const has = ['x1', 'y1', 'x2', 'y2'].filter((k) => attrs[k] !== undefined);
        if (has.length && has.length < 4) add('error', tok.at, '<x-connector> needs all of x1 y1 x2 y2, or none', slide.id);
      }
      if (name.startsWith('x-') && tok.selfClose) {
        add('error', tok.at, `<${name} … /> does not close in HTML; write <${name} …></${name}>`, slide.id);
      }
    }

    if (attrs.style !== undefined && svgDepth === 0 && !inHead) {
      for (const [prop, value] of parseStyle(attrs.style)) {
        const where = slide?.id;
        if (CSS_ADVICE[prop]) add('warn', tok.at, `${prop}: ${CSS_ADVICE[prop]}`, where);
        else if (!CSS_ALLOWED.has(prop) && !prop.startsWith('--')) add('note', tok.at, `${prop} is outside the slide subset`, where);
        if (/var\(/.test(value)) add('warn', tok.at, `${prop}: var() has nothing to read; write the value`, where);
        if (/\d(r?em|vw|vh|vmin|vmax)\b/.test(value) && prop !== 'letter-spacing') {
          add('warn', tok.at, `${prop}: ${value}: use px; the canvas is a fixed 1920×1080`, where);
        }
        if (prop === 'font-size') {
          const n = parseFloat(value);
          const unit = /pt\b/.test(value) ? n * (4 / 3) : n;
          if (!Number.isNaN(n) && unit < 24 && name !== 'section') add('warn', tok.at, `font-size ${value}: nothing on a slide goes below 24px`, where);
        }
        for (const m of value.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
          if (isRemote(m[1])) add('error', tok.at, `${prop} loads ${m[1]} from the network; save the file beside the deck`, where);
          else if (!m[1].startsWith('data:') && !existsSync(path.resolve(dir, decodeURIComponent(m[1])))) add('error', tok.at, `file not found: ${m[1]}`, where);
        }
      }
    }

    if (name === 'svg') svgDepth++;
    if (name === 'div' && svgDepth === 0) {
      divDepth++;
      if (divDepth > maxDiv) maxDiv = divDepth;
      if (divDepth === 16) add('warn', tok.at, 'more than 15 nested <div>s; flatten the slide', slide?.id);
    }
    if (!VOID.has(name) && !tok.selfClose) stack.push(name);
    else if (tok.selfClose && !VOID.has(name) && svgDepth === 0 && !name.startsWith('x-')) {
      add('warn', tok.at, `<${name} /> is not self-closing in HTML; write <${name}></${name}>`, slide?.id);
      stack.push(name);
    } else if (tok.selfClose && svgDepth > 0 && name === 'svg') {
      svgDepth--;
    }
  }
  for (const open of stack) {
    if (!['html', 'body', 'head'].includes(open)) add('error', html.length - 1, `<${open}> is never closed`);
  }
  if (slideCount === 0) add('error', 0, 'no <section> slides found');
  if (slideCount > 120) add('warn', 0, `${slideCount} slides; keep decks under about 50`);
  if (!title) add('warn', 0, 'no <title> in <head>; it names the deck and its exported files');
  if (!sawHtmlLang) add('note', 0, 'no lang on <html>; set it (en, zh-CN, …) so line breaking and hyphenation follow the language');
  return { problems, slides: slideCount, title };
}
