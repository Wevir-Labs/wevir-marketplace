/* Wevir Slides runtime: custom elements, the viewer, and the layout report. Injected by `deck.mjs build`. */
(function () {
  'use strict';
  var W = 1920;
  var H = 1080;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ICONS = window.__DECK_ICONS || {};
  var body = document.body;
  var exportMode = /(^|[#&])export(=|&|$)/.test(location.hash.slice(1));
  var zh = /^zh/i.test(document.documentElement.lang || '');
  var T = zh
    ? { prev: '上一张', next: '下一张', notes: '演讲备注', grid: '全部幻灯片', full: '全屏', none: '这张没有备注' }
    : { prev: 'Previous', next: 'Next', notes: 'Speaker notes', grid: 'All slides', full: 'Full screen', none: 'No notes on this slide' };

  function allSlides() {
    return Array.prototype.slice.call(document.querySelectorAll('section'));
  }
  function slides() {
    return allSlides().filter(function (s) {
      return !s.hasAttribute('hidden');
    });
  }
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function px(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  /* ---------- <x-icon name> ---------- */
  function upgradeIcons(root) {
    root.querySelectorAll('x-icon').forEach(function (el) {
      var name = el.getAttribute('name') || '';
      var inner = ICONS[name];
      if (!inner) return;
      el.setAttribute('role', 'img');
      if (!el.hasAttribute('aria-label')) el.setAttribute('aria-hidden', 'true');
      var sw = el.getAttribute('stroke-width') || '2';
      el.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
        sw +
        '" stroke-linecap="round" stroke-linejoin="round">' +
        inner +
        '</svg>';
    });
  }

  /* ---------- <x-shape kind> ---------- */
  var SHAPE_POINTS = {
    diamond: '50,0 100,50 50,100 0,50',
    'arrow-right': '0,25 60,25 60,0 100,50 60,100 60,75 0,75',
    'arrow-left': '100,25 40,25 40,0 0,50 40,100 40,75 100,75',
    'arrow-up': '25,100 25,40 0,40 50,0 100,40 75,40 75,100',
    'arrow-down': '25,0 25,60 0,60 50,100 100,60 75,60 75,0',
  };
  function upgradeShapes(root) {
    root.querySelectorAll('x-shape').forEach(function (el) {
      var kind = el.getAttribute('kind') || 'rect';
      if (kind === 'rect' || kind === 'rounded' || kind === 'ellipse') return;
      var cs = getComputedStyle(el);
      var fill = cs.backgroundColor;
      var stroke = cs.borderTopStyle !== 'none' && px(cs.borderTopWidth) > 0 ? cs.borderTopColor : 'none';
      var sw = stroke === 'none' ? 0 : px(cs.borderTopWidth);
      el.style.setProperty('background', 'transparent', 'important');
      el.style.setProperty('border-color', 'transparent', 'important');
      var svg = svgEl('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      if (kind === 'line') {
        svg.appendChild(
          svgEl('line', {
            x1: 0,
            y1: 50,
            x2: 100,
            y2: 50,
            stroke: stroke !== 'none' ? stroke : fill,
            'stroke-width': sw || 2,
            'vector-effect': 'non-scaling-stroke',
            'stroke-linecap': 'round',
          }),
        );
      } else if (SHAPE_POINTS[kind]) {
        svg.appendChild(
          svgEl('polygon', {
            points: SHAPE_POINTS[kind],
            fill: fill,
            stroke: stroke,
            'stroke-width': sw,
            'stroke-linejoin': 'round',
            'vector-effect': 'non-scaling-stroke',
          }),
        );
      }
      el.insertBefore(svg, el.firstChild);
    });
  }

  /* ---------- <x-connector> ---------- */
  function coord(v, size) {
    if (v == null) return null;
    v = String(v).trim();
    if (/%$/.test(v)) return (parseFloat(v) / 100) * size;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }
  function routePoints(x1, y1, x2, y2, route) {
    if (route === 'hv') return [[x1, y1], [x2, y1], [x2, y2]];
    if (route === 'vh') return [[x1, y1], [x1, y2], [x2, y2]];
    if (route === 'elbow') {
      if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) {
        var mx = (x1 + x2) / 2;
        return [[x1, y1], [mx, y1], [mx, y2], [x2, y2]];
      }
      var my = (y1 + y2) / 2;
      return [[x1, y1], [x1, my], [x2, my], [x2, y2]];
    }
    return [[x1, y1], [x2, y2]];
  }
  function dedupe(points) {
    return points.filter(function (p, i) {
      var q = points[i - 1];
      return !q || Math.abs(q[0] - p[0]) > 0.01 || Math.abs(q[1] - p[1]) > 0.01;
    });
  }
  function headShape(tip, from, kind, w, color) {
    var dx = tip[0] - from[0];
    var dy = tip[1] - from[1];
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len;
    var uy = dy / len;
    var L = Math.max(10, w * 4.2);
    var half = L * 0.5;
    var bx = tip[0] - ux * L;
    var by = tip[1] - uy * L;
    var p1 = [bx - uy * half, by + ux * half];
    var p2 = [bx + uy * half, by - ux * half];
    if (kind === 'open') {
      return {
        el: svgEl('polyline', {
          points: p1.join(',') + ' ' + tip.join(',') + ' ' + p2.join(','),
          fill: 'none',
          stroke: color,
          'stroke-width': w,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
        back: 0,
      };
    }
    return {
      el: svgEl('polygon', {
        points: p1.join(',') + ' ' + tip.join(',') + ' ' + p2.join(','),
        fill: color,
        stroke: color,
        'stroke-width': Math.max(1, w * 0.5),
        'stroke-linejoin': 'round',
      }),
      back: L * 0.75,
    };
  }
  function drawConnector(el) {
    var old = el.querySelector(':scope > svg');
    if (old) old.remove();
    var cs = getComputedStyle(el);
    var color = cs.color;
    var w = px(cs.borderTopWidth) || 2;
    if (cs.borderTopStyle === 'none' && !el.style.borderWidth) w = 2;
    var dash = cs.borderTopStyle;
    var pts;
    var hasXY = el.hasAttribute('x1');
    if (hasXY) {
      var host = el.offsetParent || el.parentElement;
      var hw = host ? host.clientWidth : W;
      var hh = host ? host.clientHeight : H;
      var x1 = coord(el.getAttribute('x1'), hw);
      var y1 = coord(el.getAttribute('y1'), hh);
      var x2 = coord(el.getAttribute('x2'), hw);
      var y2 = coord(el.getAttribute('y2'), hh);
      if ([x1, y1, x2, y2].some(function (v) {
        return v == null;
      }))
        return;
      pts = routePoints(x1, y1, x2, y2, el.getAttribute('route') || 'straight');
    } else {
      var bw = el.clientWidth;
      var bh = el.clientHeight;
      var from = el.getAttribute('from') || (bh <= 4 || bw > bh ? 'l' : 't');
      var map = {
        tl: [[0, 0], [bw, bh]],
        tr: [[bw, 0], [0, bh]],
        bl: [[0, bh], [bw, 0]],
        br: [[bw, bh], [0, 0]],
        l: [[0, bh / 2], [bw, bh / 2]],
        t: [[bw / 2, 0], [bw / 2, bh]],
      };
      pts = map[from] || map.l;
    }
    pts = dedupe(pts);
    if (pts.length < 2) return;
    var head = el.getAttribute('head') || 'end';
    var hs = el.getAttribute('head-start') || (head === 'both' ? 'filled' : 'none');
    var he = el.getAttribute('head-end') || (head === 'none' ? 'none' : 'filled');
    var minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    pts.forEach(function (p) {
      minX = Math.min(minX, p[0]);
      minY = Math.min(minY, p[1]);
      maxX = Math.max(maxX, p[0]);
      maxY = Math.max(maxY, p[1]);
    });
    var pad = w * 6 + 4;
    var svg = svgEl('svg', {
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
      viewBox: minX - pad + ' ' + (minY - pad) + ' ' + (maxX - minX + pad * 2) + ' ' + (maxY - minY + pad * 2),
      'aria-hidden': 'true',
    });
    svg.style.left = minX - pad + 'px';
    svg.style.top = minY - pad + 'px';
    var line = pts.map(function (p) {
      return p.slice();
    });
    var heads = [];
    if (he !== 'none') {
      var h1 = headShape(pts[pts.length - 1], pts[pts.length - 2], he, w, color);
      heads.push(h1.el);
      shorten(line, line.length - 1, line.length - 2, h1.back);
    }
    if (hs !== 'none') {
      var h0 = headShape(pts[0], pts[1], hs, w, color);
      heads.push(h0.el);
      shorten(line, 0, 1, h0.back);
    }
    var attrs = {
      points: line
        .map(function (p) {
          return p[0] + ',' + p[1];
        })
        .join(' '),
      fill: 'none',
      stroke: color,
      'stroke-width': w,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    };
    if (dash === 'dashed') attrs['stroke-dasharray'] = w * 3 + ' ' + w * 2.5;
    if (dash === 'dotted') attrs['stroke-dasharray'] = '0 ' + w * 2.2;
    svg.appendChild(svgEl('polyline', attrs));
    heads.forEach(function (h) {
      svg.appendChild(h);
    });
    el.appendChild(svg);
    el.style.setProperty('border-color', 'transparent', 'important');
    el.style.setProperty('border-style', 'none', 'important');
  }
  function shorten(line, i, j, by) {
    if (!by) return;
    var dx = line[i][0] - line[j][0];
    var dy = line[i][1] - line[j][1];
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len <= by) return;
    line[i][0] -= (dx / len) * by;
    line[i][1] -= (dy / len) * by;
  }
  function upgradeConnectors(root) {
    root.querySelectorAll('x-connector').forEach(drawConnector);
  }

  /* ---------- builds ---------- */
  var BUILD_VARS = {
    fade: {},
    rise: { dy: '40px' },
    drop: { dy: '-40px' },
    left: { dx: '-60px' },
    right: { dx: '60px' },
    scale: { scale: '0.92' },
    pop: { scale: '0.6' },
  };
  function buildSteps(slide) {
    var items = Array.prototype.slice.call(slide.querySelectorAll('[data-build-in]')).map(function (el, i) {
      var words = (el.getAttribute('data-build-in') || 'fade').split(/\s+/);
      var effect = BUILD_VARS[words[0]] ? words[0] : 'fade';
      var oi = words.indexOf('order');
      var order = oi >= 0 ? parseInt(words[oi + 1], 10) || i + 1 : i + 1;
      return { el: el, effect: effect, order: order, auto: words.indexOf('auto') >= 0, i: i };
    });
    items.sort(function (a, b) {
      return a.order - b.order || a.i - b.i;
    });
    var steps = [];
    items.forEach(function (it) {
      if (it.auto && steps.length) steps[steps.length - 1].push(it);
      else steps.push([it]);
    });
    return steps;
  }

  /* ---------- layout report (export mode) ---------- */
  var TEXT_TAGS = { H1: 1, H2: 1, H3: 1, P: 1, LI: 1, TD: 1, TH: 1 };
  var BASIC_FACES = /^(arial|helvetica|helvetica neue|verdana|tahoma|trebuchet ms|georgia|times new roman|times|courier new|courier|brush script mt|system-ui|-apple-system|blinkmacsystemfont|segoe ui|pingfang sc|pingfang tc|hiragino sans gb|hiragino sans|microsoft yahei|microsoft jhenghei|simsun|simhei|songti sc|heiti sc|kaiti sc|stsong|noto sans cjk sc|source han sans sc|serif|sans-serif|monospace|cursive|fantasy)$/i;

  function ownText(el) {
    var t = '';
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) t += n.nodeValue;
    return t.trim();
  }
  function describe(el) {
    var tag = el.tagName.toLowerCase();
    var t = (el.innerText || el.getAttribute('alt') || el.getAttribute('aria-label') || el.getAttribute('name') || '')
      .trim()
      .replace(/\s+/g, ' ');
    return '<' + tag + '>' + (t ? ' "' + (t.length > 48 ? t.slice(0, 47) + '…' : t) + '"' : '');
  }
  function parseColor(c) {
    var m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    var p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function lum(c) {
    function ch(v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  function contrast(a, b) {
    var x = lum(a);
    var y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function effectiveBg(el, slide) {
    for (var n = el; n; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      var c = parseColor(cs.backgroundColor);
      if (c && c.a > 0) return c.a >= 0.98 ? c : null;
      if (n === slide) break;
    }
    return null;
  }
  function overlaps(a, b, by) {
    return (
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > by &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > by
    );
  }
  // Tight horizontally (the text, not the whole box) but never taller than the element's own box: a 160px number
  // at line-height 1 has a glyph box taller than its line, which would otherwise read as overlapping its caption.
  function textRect(el) {
    var box = el.getBoundingClientRect();
    var r = document.createRange();
    r.selectNodeContents(el);
    var b = r.getBoundingClientRect();
    if (!b.width || !b.height) return box;
    return {
      left: Math.max(b.left, box.left),
      right: Math.min(b.right, box.right),
      top: Math.max(b.top, box.top),
      bottom: Math.min(b.bottom, box.bottom),
    };
  }
  function isPinned(el) {
    return getComputedStyle(el).position === 'absolute';
  }

  function reportSlide(slide, index) {
    var issues = [];
    var sr = slide.getBoundingClientRect();
    function add(level, el, msg) {
      issues.push({ level: level, element: el ? describe(el) : null, message: msg });
    }
    var cs = getComputedStyle(slide);
    var padB = px(cs.paddingBottom);
    var padT = px(cs.paddingTop);
    // Flow content: the furthest bottom of any in-flow child against the padding budget.
    var flowBottom = 0;
    Array.prototype.forEach.call(slide.children, function (c) {
      if (c.tagName === 'ASIDE' || isPinned(c)) return;
      var r = c.getBoundingClientRect();
      if (r.height) flowBottom = Math.max(flowBottom, r.bottom - sr.top);
    });
    if (flowBottom > H + 1) {
      add('error', null, 'content runs ' + Math.round(flowBottom - H) + 'px past the bottom of the slide; cut or split it');
    } else if (flowBottom > H - padB + 1) {
      add('warn', null, 'content runs ' + Math.round(flowBottom - (H - padB)) + 'px into the bottom margin (' + padB + 'px)');
    }
    if (slide.scrollWidth > slide.clientWidth + 2) {
      add('error', null, 'content is ' + (slide.scrollWidth - slide.clientWidth) + 'px wider than the slide');
    }

    var flowOverflow = flowBottom > H + 1;
    var reported = [];
    var all = slide.querySelectorAll('*');
    var texts = [];
    var count = 0;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.closest('aside') || el.closest('svg') || el.closest('x-icon') || el.closest('x-connector')) continue;
      count++;
      var r = el.getBoundingClientRect();
      var ecs = getComputedStyle(el);
      if (ecs.display === 'none' || ecs.visibility === 'hidden') continue;
      var pinned = ecs.position === 'absolute';
      var fullBleed = pinned && r.width >= W - 1 && r.height >= H - 1;
      if (r.width && r.height && !fullBleed && el.tagName !== 'X-CONNECTOR') {
        var off = Math.max(sr.left - r.left, sr.top - r.top, r.right - sr.right, r.bottom - sr.bottom);
        var underReported = reported.some(function (p) {
          return p.contains(el);
        });
        var flowSpill = flowOverflow && !pinned && r.bottom - sr.bottom === off;
        if (off > 1.5 && !underReported && !flowSpill && !el.parentElement.closest('[style*="overflow:hidden"],[style*="overflow: hidden"]')) {
          add('error', el, 'reaches ' + Math.round(off) + 'px off the slide');
          reported.push(el);
        }
        if (pinned && off <= 1.5 && el.parentElement === slide) {
          var inFooter = r.top - sr.top >= H - 128 && r.height <= 64;
          var edge = Math.min(r.left - sr.left, r.top - sr.top, sr.right - r.right, sr.bottom - r.bottom);
          if (!inFooter && edge < 40 && edge >= 0 && el.tagName !== 'IMG' && ecs.backgroundColor === 'rgba(0, 0, 0, 0)' && (el.innerText || '').trim()) {
            add('note', el, 'pinned text sits ' + Math.round(edge) + 'px from the slide edge; the margin is 128px');
          }
        }
      }
      if (el.tagName === 'DIV' && ecs.overflow === 'visible' && el.scrollWidth > el.clientWidth + 1 && el.clientWidth) {
        add('warn', el, 'what it holds is ' + (el.scrollWidth - el.clientWidth) + 'px wider than the box');
      }
      if (TEXT_TAGS[el.tagName]) {
        var hasText = (el.innerText || '').trim().length > 0;
        if (hasText) {
          if (el.scrollWidth > el.clientWidth + 1 && ecs.whiteSpace !== 'nowrap') {
            add('error', el, 'a word is ' + (el.scrollWidth - el.clientWidth) + 'px wider than its box; widen the box, shorten the word or lower the size');
          }
          if (el.scrollHeight > el.clientHeight + 2 && el.style.height) {
            add('error', el, 'text is ' + (el.scrollHeight - el.clientHeight) + 'px taller than its fixed height; remove the height');
          }
          var hasChildText = false;
          for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
            if (TEXT_TAGS[c.tagName]) hasChildText = true;
          }
          if (!hasChildText) texts.push({ el: el, rect: textRect(el) });
        }
      }
      var own = ownText(el);
      if (own) {
        var fs = px(ecs.fontSize);
        if (fs < 23.5 && !el.style.fontSize) add('warn', el, 'text at ' + Math.round(fs) + 'px; nothing on a slide goes below 24px');
        var fg = parseColor(ecs.color);
        var bg = effectiveBg(el, slide);
        var hasImageBehind = slide.querySelector('img[style*="absolute"]');
        if (fg && bg && fg.a > 0.98 && !hasImageBehind) {
          var ratio = contrast(fg, bg);
          var large = fs >= 44 || (fs >= 32 && px(ecs.fontWeight) >= 600);
          if (ratio < (large ? 3 : 4.5)) {
            add('warn', el, 'contrast ' + ratio.toFixed(1) + ':1 against its background; aim for ' + (large ? '3' : '4.5') + ':1');
          }
        }
        var fam = ecs.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
        if (fam && !declaredFaces[fam.toLowerCase()] && !BASIC_FACES.test(fam)) {
          noteFace(fam);
        } else if (fam && failedFaces[fam.toLowerCase()]) {
          noteFace(fam, true);
        }
      }
      if (el.tagName === 'IMG') {
        if (!el.getAttribute('src')) add('note', el, 'empty image frame (no src)');
        else if (!el.naturalWidth) add('error', el, 'the image did not load');
      }
    }
    if (count > 300) add('warn', null, count + ' elements on one slide; split it or simplify');
    for (var a = 0; a < texts.length; a++) {
      for (var b = a + 1; b < texts.length; b++) {
        var A = texts[a];
        var B = texts[b];
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
        if (overlaps(A.rect, B.rect, 3)) {
          add('warn', A.el, 'overlaps ' + describe(B.el));
        }
      }
    }
    var heading = null;
    for (var k = 0; k < slide.children.length; k++) {
      var ch = slide.children[k];
      if (/^H[12]$/.test(ch.tagName) && !isPinned(ch)) {
        heading = ch;
        break;
      }
      if (ch.tagName === 'P' && !isPinned(ch) && px(getComputedStyle(ch).fontSize) <= 30 && k === 0) continue;
      if (!isPinned(ch) && ch.tagName !== 'ASIDE') break;
    }
    var hr = heading ? heading.getBoundingClientRect() : null;
    var budget = H - padT - padB;
    // A hole between two flow blocks: usually space-between pushing a short body to the bottom.
    var flow = Array.prototype.filter.call(slide.children, function (c) {
      return c.tagName !== 'ASIDE' && !isPinned(c) && c.getBoundingClientRect().height > 0;
    });
    for (var f = 1; f < flow.length; f++) {
      var gapPx = flow[f].getBoundingClientRect().top - flow[f - 1].getBoundingClientRect().bottom;
      if (gapPx > 240) {
        add('warn', flow[f], Math.round(gapPx) + 'px of empty space above this block; make the body bigger (larger type, taller cards, a second row or a takeaway line) or center it in the space with a flex:1 wrapper, rather than pushing it to the bottom');
        break;
      }
    }
    if (heading && cs.justifyContent !== 'center' && flowBottom && flowBottom - padT < budget * 0.62) {
      add('note', null, 'content ends at y=' + Math.round(flowBottom) + ', leaving the lower part of the slide empty; spread it (justify-content:space-between, a flex:1 spacer) or give it more room');
    }
    return {
      index: index + 1,
      id: slide.id || null,
      title: heading ? heading.innerText.trim().replace(/\s+/g, ' ').slice(0, 80) : null,
      heading: hr ? { top: Math.round(hr.top - sr.top), size: Math.round(px(getComputedStyle(heading).fontSize)), tag: heading.tagName.toLowerCase() } : null,
      centered: cs.justifyContent === 'center',
      paddingTop: padT,
      issues: issues,
    };
  }

  var declaredFaces = {};
  var failedFaces = {};
  var faceNotes = {};
  function collectFaces() {
    if (!document.fonts) return;
    document.fonts.forEach(function (f) {
      var fam = f.family.replace(/^['"]|['"]$/g, '').toLowerCase();
      declaredFaces[fam] = true;
      if (f.status === 'error') failedFaces[fam] = true;
    });
  }
  function noteFace(fam, failed) {
    faceNotes[fam] = failed ? 'failed to load' : 'is neither embedded nor a basic face; other computers substitute it';
  }

  function report() {
    collectFaces();
    var list = slides().map(reportSlide);
    // Headings that hop: content slides of one heading size should start at one height.
    var groups = {};
    list.forEach(function (s) {
      if (!s.heading || s.centered) return;
      var key = s.heading.tag + s.heading.size;
      (groups[key] = groups[key] || []).push(s);
    });
    Object.keys(groups).forEach(function (key) {
      var g = groups[key];
      if (g.length < 3) return;
      var tops = g.map(function (s) {
        return s.heading.top;
      }).sort(function (a, b) {
        return a - b;
      });
      var median = tops[Math.floor(tops.length / 2)];
      g.forEach(function (s) {
        if (Math.abs(s.heading.top - median) > 8) {
          s.issues.push({
            level: 'note',
            element: '<' + s.heading.tag + '> "' + s.title + '"',
            message: 'heading sits at y=' + s.heading.top + ' where the other content slides have y=' + median + '; keep it at one height',
          });
        }
      });
    });
    var faces = Object.keys(faceNotes).map(function (f) {
      return { family: f, message: faceNotes[f] };
    });
    return { slides: list, faces: faces, hiddenSlides: allSlides().length - slides().length };
  }

  function exportInfo() {
    return slides().map(function (s, i) {
      var r = s.getBoundingClientRect();
      var aside = s.querySelector(':scope > aside');
      var heading = s.querySelector('h1, h2, h3');
      var text = s.cloneNode(true);
      var a2 = text.querySelector(':scope > aside');
      if (a2) a2.remove();
      return {
        index: i + 1,
        id: s.id || null,
        top: Math.round(r.top + window.scrollY),
        left: Math.round(r.left + window.scrollX),
        notes: aside ? aside.innerText.trim() : '',
        title: heading ? heading.innerText.trim().replace(/\s+/g, ' ') : '',
        text: (text.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1000),
      };
    });
  }

  /* ---------- viewer ---------- */
  var current = 0;
  var step = 0;
  var steps = [];
  var stage;
  var ui;
  var notesEl;
  var countEl;
  var busy = null;

  function fit() {
    var nh = body.classList.contains('deck-notes-open') ? Math.round(Math.min(260, window.innerHeight * 0.3)) : 0;
    document.documentElement.style.setProperty('--deck-notes-h', nh + 'px');
    var s = Math.min(window.innerWidth / W, (window.innerHeight - nh) / H);
    document.documentElement.style.setProperty('--deck-scale', String(s));
    var cell = document.querySelector('.deck-cell');
    if (body.getAttribute('data-deck-mode') === 'overview' && cell) {
      document.documentElement.style.setProperty('--deck-cell-scale', String(cell.clientWidth / W));
    }
  }

  function setBuilds(slide, shownSteps, animateLast) {
    var st = buildSteps(slide);
    st.forEach(function (group, gi) {
      group.forEach(function (it) {
        var v = BUILD_VARS[it.effect];
        it.el.classList.remove('deck-build-in');
        if (gi < shownSteps) {
          it.el.classList.remove('deck-build-pending');
          if (animateLast && gi === shownSteps - 1) {
            it.el.style.setProperty('--deck-build-dx', v.dx || '0px');
            it.el.style.setProperty('--deck-build-dy', v.dy || '0px');
            it.el.style.setProperty('--deck-build-scale', v.scale || '1');
            void it.el.offsetWidth;
            it.el.classList.add('deck-build-in');
          }
        } else {
          it.el.classList.add('deck-build-pending');
        }
      });
    });
    return st;
  }

  function show(index, opts) {
    opts = opts || {};
    var list = slides();
    if (!list.length) return;
    index = Math.max(0, Math.min(list.length - 1, index));
    var prev = list[current];
    var next = list[index];
    if (busy) {
      busy();
      busy = null;
    }
    if (prev !== next && prev && opts.animate !== false) {
      var t = (prev.getAttribute('data-transition') || '').trim();
      var dir = index > current ? 1 : -1;
      if (t === 'fade' || t === 'magic' || t === 'push') {
        var inC = t === 'push' ? 'deck-anim-push-in' : 'deck-anim-fade-in';
        var outC = t === 'push' ? 'deck-anim-push-out' : 'deck-anim-fade-out';
        document.documentElement.style.setProperty('--deck-push-dir', String(dir));
        prev.classList.add('deck-leaving', outC);
        next.classList.add(inC);
        var done = function () {
          prev.classList.remove('deck-leaving', outC);
          next.classList.remove(inC);
        };
        busy = done;
        setTimeout(function () {
          if (busy === done) {
            done();
            busy = null;
          }
        }, 560);
      }
    }
    list.forEach(function (s, i) {
      s.classList.toggle('deck-current', i === index);
      s.parentElement.classList.toggle('deck-current', i === index);
    });
    current = index;
    var st = buildSteps(next);
    step = opts.allBuilds ? st.length : 0;
    steps = setBuilds(next, step, false);
    countEl.textContent = index + 1 + ' / ' + list.length;
    var aside = next.querySelector(':scope > aside');
    notesEl.textContent = aside ? aside.innerText.trim() : '';
    if (location.hash !== '#' + (index + 1)) history.replaceState(null, '', '#' + (index + 1));
  }

  function nextStep() {
    if (step < steps.length) {
      step++;
      setBuilds(slides()[current], step, true);
      return;
    }
    if (current < slides().length - 1) show(current + 1);
  }
  function prevStep() {
    if (current > 0) show(current - 1, { allBuilds: true });
  }

  function setMode(mode) {
    body.setAttribute('data-deck-mode', mode);
    ui.querySelector('[data-act=grid]').setAttribute('aria-pressed', mode === 'overview' ? 'true' : 'false');
    fit();
    if (mode === 'overview') {
      var cur = slides()[current];
      if (cur) cur.parentElement.scrollIntoView({ block: 'center' });
    }
  }

  function icon(d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  }

  function initViewer() {
    body.setAttribute('data-deck-mode', 'view');
    stage = document.createElement('main');
    stage.className = 'deck-stage';
    stage.tabIndex = -1;
    allSlides().forEach(function (s) {
      var cell = document.createElement('div');
      cell.className = 'deck-cell';
      s.parentNode.insertBefore(cell, s);
      cell.appendChild(s);
      stage.appendChild(cell);
    });
    body.appendChild(stage);
    slides().forEach(function (s, i) {
      s.parentElement.setAttribute('data-n', String(i + 1));
    });
    allSlides().forEach(function (s) {
      if (s.hasAttribute('hidden')) s.parentElement.style.display = 'none';
    });

    ui = document.createElement('div');
    ui.className = 'deck-ui';
    ui.innerHTML =
      '<button data-act="prev" title="' + T.prev + '" aria-label="' + T.prev + '">' + icon('<path d="m15 18-6-6 6-6"/>') + '</button>' +
      '<span class="deck-count" aria-live="polite"></span>' +
      '<button data-act="next" title="' + T.next + '" aria-label="' + T.next + '">' + icon('<path d="m9 18 6-6-6-6"/>') + '</button>' +
      '<button data-act="notes" title="' + T.notes + ' (N)" aria-label="' + T.notes + '" aria-pressed="false">' + icon('<path d="M4 6h16M4 12h16M4 18h10"/>') + '</button>' +
      '<button data-act="grid" title="' + T.grid + ' (G)" aria-label="' + T.grid + '" aria-pressed="false">' + icon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>') + '</button>' +
      '<button data-act="full" title="' + T.full + ' (F)" aria-label="' + T.full + '">' + icon('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>') + '</button>';
    body.appendChild(ui);
    countEl = ui.querySelector('.deck-count');
    notesEl = document.createElement('div');
    notesEl.className = 'deck-notes';
    notesEl.setAttribute('data-empty', T.none);
    body.appendChild(notesEl);

    function toggleNotes() {
      body.classList.toggle('deck-notes-open');
      ui.querySelector('[data-act=notes]').setAttribute('aria-pressed', body.classList.contains('deck-notes-open') ? 'true' : 'false');
      fit();
    }
    function toggleFull() {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
    }
    ui.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      e.stopPropagation();
      var act = b.getAttribute('data-act');
      if (act === 'prev') prevStep();
      if (act === 'next') nextStep();
      if (act === 'notes') toggleNotes();
      if (act === 'grid') setMode(body.getAttribute('data-deck-mode') === 'overview' ? 'view' : 'overview');
      if (act === 'full') toggleFull();
    });

    stage.addEventListener('click', function (e) {
      if (body.getAttribute('data-deck-mode') === 'overview') {
        var cell = e.target.closest('.deck-cell');
        if (!cell) return;
        var i = slides().indexOf(cell.querySelector('section'));
        setMode('view');
        if (i >= 0) show(i, { animate: false });
        return;
      }
      if (e.target.closest('a')) return;
      var sel = window.getSelection && String(window.getSelection());
      if (sel) return;
      if (e.clientX < window.innerWidth * 0.25) prevStep();
      else nextStep();
    });

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key;
      var overview = body.getAttribute('data-deck-mode') === 'overview';
      if (overview) {
        if (k === 'Escape' || k === 'g' || k === 'G' || k === 'Enter') {
          setMode('view');
          e.preventDefault();
        } else if (k === 'ArrowRight' || k === 'ArrowDown') {
          show(current + 1, { animate: false });
          slides()[current].parentElement.scrollIntoView({ block: 'nearest' });
        } else if (k === 'ArrowLeft' || k === 'ArrowUp') {
          show(current - 1, { animate: false });
          slides()[current].parentElement.scrollIntoView({ block: 'nearest' });
        }
        return;
      }
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') nextStep();
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') prevStep();
      else if (k === 'Home') show(0);
      else if (k === 'End') show(slides().length - 1, { allBuilds: true });
      else if (k === 'n' || k === 'N') toggleNotes();
      else if (k === 'g' || k === 'G' || k === 'Escape') {
        if (k === 'Escape' && document.fullscreenElement) return;
        setMode('overview');
      } else if (k === 'f' || k === 'F') toggleFull();
      else return;
      e.preventDefault();
    });

    var touchX = null;
    stage.addEventListener('touchstart', function (e) {
      touchX = e.touches[0].clientX;
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (touchX == null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 40) (dx < 0 ? nextStep : prevStep)();
    });

    var idle;
    document.addEventListener('mousemove', function () {
      body.classList.add('deck-ui-awake');
      clearTimeout(idle);
      idle = setTimeout(function () {
        body.classList.remove('deck-ui-awake');
      }, 1800);
    });
    window.addEventListener('resize', fit);
    window.addEventListener('hashchange', function () {
      var n = parseInt(location.hash.slice(1), 10);
      if (n && n - 1 !== current) show(n - 1, { animate: false });
    });
    window.addEventListener('beforeprint', function () {
      slides().forEach(function (s) {
        setBuilds(s, Infinity, false);
      });
    });
    window.addEventListener('afterprint', function () {
      show(current, { animate: false });
    });

    fit();
    var start = parseInt(location.hash.slice(1), 10);
    current = 0;
    show(start ? start - 1 : 0, { animate: false });
    stage.focus({ preventScroll: true });
  }

  function upgradeAll() {
    upgradeIcons(document);
    upgradeShapes(document);
    upgradeConnectors(document);
  }

  if (exportMode) {
    body.setAttribute('data-deck-mode', 'export');
    upgradeAll();
    window.__deck = {
      report: report,
      slides: exportInfo,
      ready: function () {
        return (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () {
          upgradeConnectors(document);
          return true;
        });
      },
    };
  } else {
    upgradeAll();
    initViewer();
    // Connectors measure their host; redraw once web fonts settle the layout.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () {
      upgradeConnectors(document);
    });
  }
})();
