// The install screen's animated phone: one simple picture per numbered step, for each browser, so
// members see where to tap (DECISIONS.md, install screen). Drawn, not screenshots: a few KB, works
// offline, follows the language switch, and doesn't pretend to match every phone exactly.
// app.js shows one frame at a time and highlights the matching step.

const NS = 'http://www.w3.org/2000/svg';
const TAP = '#e8590c';
let ids = 0;

function svg(tag, attrs = {}, children = []) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const c of [].concat(children)) if (c) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}

const rect = (x, y, width, height, rx, fill, extra = {}) => svg('rect', { x, y, width, height, rx, fill, ...extra });
const text = (x, y, t, size, extra = {}) => svg('text', { x, y, 'font-size': size, fill: '#111', ...extra }, t);
const image = (href, x, y, size) => svg('image', { href, x, y, width: size, height: size });
/** Where the finger goes, around a small button (⋮, Share): a steady ring and a pulse leaving it. */
const tap = (cx, cy, r = 13) => [
  svg('circle', { cx, cy, r, fill: 'none', stroke: TAP, 'stroke-width': 2.5 }),
  svg('circle', { class: 'tap', cx, cy, r, fill: 'none', stroke: TAP, 'stroke-width': 3 }),
];
/** Where the finger goes, around a row or a button with words: outlined, never covering the words. */
const tapBox = (x, y, width, height, rx = 8) => [
  rect(x, y, width, height, rx, 'none', { stroke: TAP, 'stroke-width': 2.5 }),
  rect(x, y, width, height, rx, 'none', { class: 'tap-box', stroke: TAP, 'stroke-width': 3 }),
];
const dots = (cx, cy) => [-7, 0, 7].map((d) => svg('circle', { cx, cy: cy + d, r: 2.3, fill: '#444' }));
const frame = (children) => svg('g', { class: 'demo-frame' }, children);
const dim = () => rect(10, 16, 180, 298, 0, 'rgba(0,0,0,.45)');

/** A page standing in for this one: the icon, the name and some lines. */
function page(y) {
  return [
    image('icons/icon-192.png', 80, y, 40),
    text(100, y + 56, 'Open Gym', 12, { 'text-anchor': 'middle', 'font-weight': 'bold' }),
    rect(30, y + 68, 140, 6, 3, '#e4e4e4'),
    rect(40, y + 80, 120, 6, 3, '#e4e4e4'),
    rect(35, y + 92, 130, 6, 3, '#e4e4e4'),
    rect(22, y + 108, 156, 64, 8, 'none', { stroke: '#e4e4e4', 'stroke-width': 2 }),
  ];
}

/**
 * A highlighted menu row with the browser's own words, outlined; long words wrap onto a second line.
 * [icon]: the menu's own icon before the words, as the browser draws it.
 */
function row(x, y, w, label, size = 10.5, icon = null) {
  const indent = icon ? 30 : 10;
  const lines = wrap(label, Math.floor((w - indent - 10) / (size * 0.64)));
  const h = 10 + lines.length * (size + 4);
  return [
    rect(x, y, w, h, 6, '#fde3d3'),
    icon ? image(icon, x + 8, y + (h - 16) / 2, 16) : '',
    ...lines.map((l, i) => text(x + indent, y + 4 + (i + 1) * (size + 3), l, size, { 'font-weight': 'bold' })),
    ...tapBox(x - 1, y - 1, w + 2, h + 2, 7),
  ];
}

/** Splits [label] into lines of at most [max] characters, at spaces. */
function wrap(label, max) {
  const lines = [];
  for (const word of label.split(' ')) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + word).length <= max) lines[lines.length - 1] = last + ' ' + word;
    else lines.push(word);
  }
  return lines;
}

function greyRows(x, ys, w) {
  return ys.map((y) => rect(x, y, w, 6, 3, '#dcdcdc'));
}

/** Android's confirmation: the app's icon and name, then Cancel and the button to tap. */
function confirm(s, button) {
  return [
    dim(),
    rect(22, 112, 156, 104, 14, '#fff'),
    image('icons/icon-192.png', 36, 128, 30),
    text(74, 148, 'Open Gym', 12, { 'font-weight': 'bold' }),
    text(84, 199, s.demo.cancel, 10.5, { fill: '#1a73e8', 'text-anchor': 'middle' }),
    rect(116, 184, 54, 22, 11, '#1a73e8'),
    text(143, 199, button, 10.5, { fill: '#fff', 'text-anchor': 'middle', 'font-weight': 'bold' }),
    ...tapBox(112, 180, 62, 30, 15),
  ];
}

/** Address bar at the top, ⋮ at its right: Chrome and Firefox as they open by default. */
function topBar() {
  return [rect(10, 16, 180, 36, 0, '#f1f3f4'), rect(18, 24, 142, 20, 10, '#fff', { stroke: '#d8d8d8' }), ...dots(178, 34)];
}

/** The menu that drops from ⋮, with [label] highlighted at row position [y]. */
function dropDown(label, y = 126) {
  return [
    rect(54, 46, 132, 172, 8, 'rgba(0,0,0,.18)', { transform: 'translate(2 3)' }),
    rect(54, 46, 132, 172, 8, '#fff', { stroke: '#d8d8d8' }),
    ...greyRows(66, [62, 84, 106, 134, 158, 196].filter((r) => r < y - 4 || r > y + 26), 96),
    ...row(58, y, 124, label),
  ];
}

/**
 * Firefox's menu: a panel up from the bottom, a row of round buttons on top, then rows. Folded, its
 * last row is [label] with a ˅; unfolded (the next picture), [label] is a row further down the list.
 */
function bottomMenu(label, folded, icon = null) {
  return [
    dim(),
    rect(10, 124, 180, 200, 14, '#f4f4f6'),
    rect(86, 132, 28, 4, 2, '#c8c8cc'),
    ...[40, 80, 120, 160].map((cx) => svg('circle', { cx, cy: 156, r: 9, fill: '#dcdce0' })),
    ...greyRows(30, folded ? [184, 206, 228] : [184, 206, 228, 296], 110),
    ...row(18, folded ? 246 : 244, 164, label, 10.5, icon),
    folded ? text(168, 264, '˅', 14, { 'text-anchor': 'middle', 'font-weight': 'bold' }) : '',
  ];
}

const BUILD = {
  chrome: (s) => ({
    base: [...topBar(), ...page(66)],
    frames: [tap(178, 34), dropDown(s.demo.chromeItem), confirm(s, s.demo.install)],
  }),
  // Firefox 157 on the owner's Samsung (20 Oct): ⋮ top right opens a panel from the bottom; "Add app
  // to Home screen" is under "More", which unfolds; then Android's own "Add to Home screen?" box.
  firefox: (s) => ({
    base: [...topBar(), ...page(66)],
    frames: [tap(178, 34), bottomMenu(`⋯  ${s.demo.more}`, true), bottomMenu(s.demo.firefoxItem, false, 'icons/ui/add-to-homescreen.svg'), confirm(s, s.demo.androidAdd)],
  }),
  // Samsung Internet 30 on the owner's Samsung (20 Oct): toolbar at the bottom, ⋮ at its right; a menu
  // pops up with "Add page to"; a list from the bottom with "Home screen"; then the launcher's box.
  samsung: (s) => ({
    base: [
      rect(10, 16, 180, 36, 0, '#f1f3f4'), rect(18, 24, 164, 20, 10, '#fff', { stroke: '#d8d8d8' }),
      ...page(66),
      rect(10, 282, 180, 32, 0, '#f1f3f4'),
      ...['‹', '›', '⌂', '☆', '▢'].map((g, i) => text(26 + i * 30, 304, g, 14, { fill: '#666', 'text-anchor': 'middle' })),
      ...dots(178, 298),
    ],
    frames: [
      tap(178, 298),
      [
        rect(66, 92, 120, 182, 12, 'rgba(0,0,0,.18)', { transform: 'translate(2 3)' }),
        rect(66, 92, 120, 182, 12, '#fff', { stroke: '#d8d8d8' }),
        image('icons/icon-192.png', 76, 102, 18),
        text(100, 115, 'Open Gym', 10, { 'font-weight': 'bold' }),
        ...greyRows(80, [134, 152, 212, 230, 248, 264], 80),
        ...row(70, 168, 112, s.demo.samsungItem, 10),
      ],
      [
        dim(),
        rect(10, 160, 180, 160, 14, '#fff'),
        ...greyRows(26, [184, 206, 274], 100),
        ...row(18, 224, 164, s.demo.samsungHome),
      ],
      confirm(s, s.demo.androidAdd),
    ],
  }),
  safari: (s) => ({
    base: [
      ...page(34),
      rect(22, 252, 156, 22, 11, '#ececec'),
      rect(10, 280, 180, 34, 0, '#f7f7f7'),
      text(30, 304, '‹', 20, { fill: '#007aff' }),
      text(62, 304, '›', 20, { fill: '#c7c7cc' }),
      image('icons/ui/share.svg', 90, 286, 20),
      rect(128, 290, 15, 13, 2, 'none', { stroke: '#007aff', 'stroke-width': 1.6 }),
      rect(162, 289, 12, 12, 2, 'none', { stroke: '#007aff', 'stroke-width': 1.6 }),
    ],
    frames: [
      tap(100, 296, 14),
      [
        dim(),
        rect(10, 96, 180, 230, 14, '#f2f2f7'),
        image('icons/icon-192.png', 22, 108, 26),
        text(56, 125, 'Open Gym', 11, { 'font-weight': 'bold' }),
        rect(18, 148, 164, 124, 10, '#fff'),
        ...greyRows(28, [160, 184, 252], 90),
        ...row(18, 200, 164, s.demo.safariItem),
      ],
      [
        rect(10, 16, 180, 298, 0, '#f2f2f7'),
        text(22, 42, s.demo.cancel, 11, { fill: '#007aff' }),
        text(178, 42, s.demo.add, 11.5, { fill: '#007aff', 'text-anchor': 'end', 'font-weight': 'bold' }),
        ...tapBox(124, 26, 60, 24, 8),
        rect(18, 60, 164, 60, 10, '#fff'),
        image('icons/icon-192.png', 28, 70, 40),
        text(78, 95, 'Open Gym', 12),
      ],
    ],
  }),
};

/** The picture for [browser] in language [s]: the svg and its frames, all hidden until shown. */
export function installDemo(browser, s) {
  const build = BUILD[browser];
  if (!build) return null;
  const { base, frames } = build(s);
  const clip = `screen${++ids}`;
  const groups = frames.map(frame);
  const pic = svg('svg', { viewBox: '0 0 200 330', class: 'demo-phone', 'aria-hidden': 'true' }, [
    svg('clipPath', { id: clip }, rect(10, 16, 180, 298, 14, '#fff')),
    rect(2, 2, 196, 326, 28, '#222'),
    svg('g', { 'clip-path': `url(#${clip})` }, [rect(10, 16, 180, 298, 0, '#fff'), ...base, ...groups]),
  ]);
  return { pic, frames: groups };
}
