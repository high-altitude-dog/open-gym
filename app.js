// Open Gym: the gym check-in code as a home-screen web app, with the same codes as the Android app (DECISIONS.md, 20 Oct).
// Screens: install (in a browser tab), welcome (no key yet), code, register. K lives in RAM only.
import * as G from './gymcrypto.js';
import * as store from './store.js';
import { ALL, ES } from './strings.js';
import { GYM_PK_HEX } from './gym.js';
import qrcodegen from './vendor/qrcodegen.js';
import { installDemo } from './demo.js';

const gymPk = G.unhex(GYM_PK_HEX);
/** Byte gym stills 10–18 (Byte the dog artwork used with permission, not under the app's MIT licence). */
const BYTES = [
  'byte_10_kettlebell_carry', 'byte_11_jump_rope', 'byte_12_batido', 'byte_13_champion_podium',
  'byte_14_banana_power', 'byte_15_climbing_wall', 'byte_16_sprint', 'byte_17_cardio_heart',
  'byte_18_battle_ropes',
];

const app = document.getElementById('app');
let s = ES;
let screen = 'code';
let devPk = null;
let k = null;
let lastT = -1;
let timer = 0;
/** Seconds the phone clock is out by, from the last check that reached the host; 0 = fine or unknown. */
let clockOff = 0;
/** store.keepData(): true, false (refused: warn), or null (this browser can't say). */
let keptData = null;
let message = 0;
let byteIndex = 0;
let installEvent = null;
/** Set when the browser says the app was saved to the home screen: step 1 shows done. */
let installed = false;
let wakeLock = null;
/** The install screen's animation: the pending switch to its next picture. */
let demoTimer = 0;
let qrCanvas = null;
/** Modules across the QR on screen, quiet zone included (for the 70% floor). */
let qrModules = 0;
/** CSS pixels the QR may take on the link screen once fitted to the screen; 0 = not fitted yet. */
let qrRoom = 0;
/** The warning boxes on screen: the clock one above the QR (urgent), the storage note below it. */
let warn = { clock: null, note: null };

// Only on the PC, for testing in a tab: http://localhost:8000/?tab
const devTab = location.hostname === 'localhost' && new URLSearchParams(location.search).has('tab');

const standalone = () => devTab
  || matchMedia('(display-mode: standalone)').matches
  || matchMedia('(display-mode: fullscreen)').matches
  || navigator.standalone === true;

async function start() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!window.isSecureContext || !crypto.subtle || !window.indexedDB) {
    app.replaceChildren(el('p', 'warn', 'Open this page over https:// / Abre esta página con https://'));
    return;
  }
  history.replaceState({ screen: 'code' }, '');
  newVisit();
  if (!standalone()) {
    screen = 'install';
    render();
    return;
  }
  let seed = null;
  try {
    seed = await store.load();
  } catch {
    seed = null;
  }
  if (!seed) {
    screen = 'welcome';
    render();
    return;
  }
  useSeed(seed);
  render();
  keptData = await store.keepData();
  render();
  checkClock();
}

/** Every opening starts in Spanish, with the next motivation line and the next Byte. */
function newVisit() {
  s = ES;
  message = next('lastMessage', ES.motivation.length);
  byteIndex = next('lastByte', BYTES.length);
}

function next(key, size) {
  let n = 0;
  try {
    n = ((parseInt(localStorage.getItem(key) ?? '-1', 10) + 1) % size + size) % size || 0;
    localStorage.setItem(key, String(n));
  } catch {
    n = Math.floor(Math.random() * size);
  }
  return n;
}

function useSeed(seed) {
  devPk = G.edPublicKey(seed);
  k?.fill(0);
  k = G.deriveK(seed, gymPk);
  seed.fill(0);
  lastT = -1;
}

function go(to) {
  history.pushState({ screen: to }, '');
  screen = to;
  render();
}

addEventListener('popstate', (e) => {
  if (screen === 'code' || screen === 'register') {
    screen = e.state?.screen === 'register' ? 'register' : 'code';
    render();
  }
});

// ---- Screens ----

function render() {
  clearTimeout(timer);
  qrRoom = 0;
  clearTimeout(demoTimer);
  qrCanvas = null;
  warn = { clock: null, note: null };
  document.documentElement.lang = s === ES ? 'es' : 'en';
  // The link screen is framed in blue (staff spot it across the desk); blue isn't a reader light colour.
  document.body.classList.toggle('linking', screen === 'register');
  const views = { install: installView, welcome: welcomeView, code: codeView, register: registerView };
  app.replaceChildren(...views[screen]());
  if (qrCanvas) {
    lastT = -1;
    tick();
    keepAwake();
  }
}

function codeView() {
  const greeting = s.greetings[(() => {
    const h = new Date().getHours();
    return h >= 5 && h <= 11 ? 0 : h >= 12 && h <= 17 ? 1 : 2;
  })()];
  const byte = el('img', 'byte');
  byte.src = `img/${BYTES[byteIndex]}.webp`;
  byte.alt = 'Byte';
  const link = el('button', 'link', s.linkAgain);
  link.onclick = () => go('register');
  // The whole QR on the first screen, whatever the phone: the storage note goes below it and the
  // flags to the bottom (as in the Android app); only the clock warning, urgent and rare, stays above.
  return [
    el('header', 'head', [byte, el('div', 'hello', [el('h1', '', greeting), el('p', '', s.motivation[message])])]),
    clockBox(),
    qr(),
    el('p', 'hold', s.holdUp),
    noteBox(),
    el('p', 'hint', s.brightness),
    link,
    el('div', 'foot-flags', [flags()]),
  ];
}

/**
 * The link screen: a step of its own, not a sub-page. The phone can't tell when the reader has
 * linked it, so the member taps Done when the reader flashes green. No Reset key (owner, 20 Oct):
 * a lost key is replaced through the welcome screen, and an unlinked key can be linked again.
 */
function registerView() {
  const done = el('button', 'button primary', s.done);
  done.onclick = () => history.back(); // always to the code screen, below this one in history
  // The steps come first; then the QR, the key ID and Done together, the QR sized so Done needs no scrolling.
  return [
    // No bar: the blue frame marks the screen for staff; the flags share the title's line (owner, 20 Oct).
    el('header', 'link-head', [el('h1', 'link-title', s.linkTitle), flags()]),
    clockBox(),
    el('ol', 'steps', s.linkSteps.map((step) => el('li', '', step))),
    qr(),
    el('p', 'mono key-id', s.keyId + G.hex(G.keyId(devPk))),
    done,
    noteBox(),
  ];
}

function welcomeView() {
  const make = el('button', 'button primary', s.makeKey);
  const error = el('p', 'warn hidden', s.keyError);
  make.onclick = async () => {
    make.disabled = true;
    try {
      keptData = await store.keepData(); // first, while the tap still counts as the member's choice
      useSeed(await store.create());
      go('register');
      checkClock();
    } catch {
      error.classList.remove('hidden');
      make.disabled = false;
    }
  };
  return [
    el('header', 'head end', [flags()]),
    logo(),
    el('h1', 'title', s.welcomeTitle),
    el('p', '', s.welcomeText),
    make,
    el('p', 'allow', s.welcomeAllow),
    error,
    el('p', 'small', s.welcomeLost),
  ];
}

/**
 * Install screen, for people new to phones: two numbered steps. Step 1 shows only the steps for the
 * browser this page is open in, one tap per line, with the buttons drawn as they look; the others
 * wait under "Another phone or browser?". Browsers that can't save the app get a way to the one
 * that can; a computer shows a QR code of this page to open on the phone.
 */
function installView() {
  const where = platform();
  // Compact: icon, name and flags in one row, so step 1 starts on the first screen of a small phone.
  const top = [el('header', 'install-head', [logo(), el('h1', 'install-title', 'Open Gym'), flags()])];
  if (where === 'computer') {
    const canvas = el('canvas', 'qr');
    draw(qrcodegen.QrCode.encodeText(pageUrl(), qrcodegen.QrCode.Ecc.MEDIUM), canvas, 260);
    return [...top, card(null, s.onComputer, [el('p', '', s.onComputerText), canvas])];
  }
  const option = INSTALL_OPTIONS.find((o) => o.browser === where);
  return [
    ...top,
    el('p', 'lead', s.installIntro),
    card(installed ? '✓' : '1', s.installStep1, installed ? [el('p', 'saved', s.installSaved)] : stepOne(where, option), installed ? 'done' : ''),
    card('2', s.installStep2, [el('p', '', s.installStep2Text), tile()], installed ? 'next' : ''),
    el('details', 'other', [
      el('summary', '', s.installOther),
      ...INSTALL_OPTIONS.filter((o) => o !== option).map((o) => el('div', 'option', [optionHead(o), ...howTo(o)])),
    ]),
  ];
}

function stepOne(where, option) {
  if (where === 'android-other') {
    // No browser named: Android opens the phone's own browser (Chrome may be switched off, as on the owner's Samsung).
    const open = el('a', 'button primary big', s.openInBrowser);
    open.href = `intent://${location.host}${location.pathname}#Intent;scheme=https;end`;
    return [el('p', '', s.openInBrowserText), open, nudge()];
  }
  if (where === 'ios-other') {
    const copy = el('button', 'button primary big', s.copyLink);
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(pageUrl());
        copy.textContent = s.copied;
      } catch {
        copy.hidden = true; // the address below can still be copied by hand
      }
    };
    return [el('p', '', s.openInSafariText), copy, el('p', 'address', pageUrl())];
  }
  if (where === 'chrome' && installEvent) {
    // Chrome offers to save the app: one big button, and the manual steps folded away.
    const save = el('button', 'button primary big', s.installSave);
    save.onclick = async () => {
      const e = installEvent;
      installEvent = null;
      await e?.prompt();
    };
    return [optionHead(option), save, el('details', 'byhand', [el('summary', '', s.installByHand), ...howTo(option)])];
  }
  if (where === 'samsung') return [nudge(), el('p', 'or-stay', s.orStay), optionHead(option), ...howTo(option, true)];
  return [optionHead(option), ...howTo(option, true)];
}

/**
 * Samsung Internet and browsers we have no steps for: suggest Firefox, which keeps the key safe
 * (it agreed to protect storage on the owner's phone; Samsung Internet refused in a tab), one tap
 * away on Google Play. A suggestion only: the steps stay.
 */
function nudge() {
  const icon = el('img', 'brand');
  icon.src = 'icons/brand/firefox.svg';
  icon.alt = '';
  const get = el('a', 'button big firefox', s.getFirefox);
  get.href = 'https://play.google.com/store/apps/details?id=org.mozilla.firefox';
  get.rel = 'noopener';
  return el('div', 'nudge', [el('p', 'option-head', [icon, el('strong', '', s.nudge)]), get]);
}

/** A numbered step: a big number (or ✓) and a title, then its content. */
function card(num, title, body, state = '') {
  const h = el('h2', '', [num ? el('span', num === '✓' ? 'num ok' : 'num', num) : '', title]);
  return el('section', `card ${state}`.trim(), [h, ...body]);
}

/** The app's icon as it looks on a home screen, so members know what to look for. */
function tile() {
  const img = el('img', '');
  img.src = 'icons/icon-192.png';
  img.alt = '';
  return el('div', 'tile', [el('span', 'ring'), img, el('span', '', 'Open Gym')]);
}

const pageUrl = () => location.origin + location.pathname;

/** Which install steps fit the browser this page is open in. */
function platform() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|Line\//.test(ua) ? 'ios-other' : 'safari';
  if (/Android/.test(ua)) {
    // In-app browsers (Facebook, Instagram, Android WebView) and browsers we have no steps for: to the phone's browser.
    if (/; wv\)|FBAN|FBAV|Instagram/.test(ua)) return 'android-other';
    if (/SamsungBrowser/.test(ua)) return 'samsung';
    if (/EdgA|OPR\/|YaBrowser|MiuiBrowser|UCBrowser/.test(ua)) return 'android-other';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/Chrome\//.test(ua)) return 'chrome';
    return 'android-other';
  }
  return 'computer';
}

/** One per phone and browser: its logos, its name, then what to tap (logos in icons/brand/, see vendor/README.md). */
const INSTALL_OPTIONS = [
  { os: 'apple', browser: 'safari', name: 'iPhone · Safari', steps: 'installSafari' },
  { os: 'android', browser: 'chrome', name: 'Android · Chrome', steps: 'installChrome' },
  { os: 'android', browser: 'firefox', name: 'Android · Firefox', steps: 'installFirefox' },
  { os: 'android', browser: 'samsung', name: 'Android · Samsung Internet', steps: 'installSamsung' },
];

function optionHead(o) {
  const icon = (name) => {
    const img = el('img', 'brand');
    img.src = `icons/brand/${name}.svg`;
    img.alt = ''; // the name beside it says the same
    return img;
  };
  return el('div', 'option-head', [icon(o.os), icon(o.browser), el('strong', '', o.name)]);
}

function howTo(o, animate = false) {
  const list = el('ol', 'howto', s[o.steps].map((t) => el('li', '', withKeys(t))));
  const note = s[`${o.steps}Note`]; // Safari and Samsung Internet
  return [...(animate ? demo(o.browser, list) : []), list, note ? el('p', 'aside', withKeys(note)) : ''];
}

/**
 * The animated phone above the steps: one picture per step, about 3 s each, the matching step
 * highlighted. A tap on the picture (or a step) stops it there, to go one step at a time. With
 * "reduce motion" set on the phone it never moves by itself.
 */
function demo(browser, list) {
  const d = installDemo(browser, s);
  if (!d || d.frames.length !== list.children.length) return [];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0;
  const show = (n) => {
    i = n % d.frames.length;
    d.frames.forEach((f, j) => f.classList.toggle('on', j === i));
    [...list.children].forEach((li, j) => li.classList.toggle('now', j === i));
  };
  const play = () => {
    demoTimer = setTimeout(() => { show(i + 1); play(); }, i === d.frames.length - 1 ? 4000 : 3000);
  };
  const stop = () => clearTimeout(demoTimer);
  d.pic.addEventListener('click', () => { stop(); show(i + 1); });
  [...list.children].forEach((li, j) => li.addEventListener('click', () => { stop(); show(j); }));
  show(0);
  if (!still) play();
  return [el('div', 'demo', [d.pic]), still ? el('p', 'aside center', s.demoTapHint) : ''];
}

/** Text with {menu}, {share}, {more} and {addapp} drawn as the buttons and icons they name. */
function withKeys(text) {
  return text.split(/(\{menu\}|\{share\}|\{more\}|\{addapp\})/).filter(Boolean).map((part) => {
    if (part === '{menu}') return keyCap('⋮', s === ES ? 'menú' : 'menu');
    if (part === '{more}') return keyCap('⋯', s === ES ? 'más opciones' : 'more options');
    if (part === '{addapp}') {
      const img = el('img', '');
      img.src = 'icons/ui/add-to-homescreen.svg';
      img.alt = ''; // Firefox's icon for the menu item named right after it
      return el('span', 'key', [img]);
    }
    if (part === '{share}') {
      const img = el('img', '');
      img.src = 'icons/ui/share.svg';
      img.alt = s === ES ? 'Compartir' : 'Share';
      return el('span', 'key', [img]);
    }
    return document.createTextNode(part);
  });
}

function keyCap(symbol, label) {
  const k = el('span', 'key', symbol);
  k.setAttribute('aria-label', label);
  return k;
}

function logo() {
  const img = el('img', 'logo');
  img.src = 'icons/icon-192.png';
  img.alt = '';
  return img;
}

/** One flag per language; the current one full strength, the other faded. Lasts for this visit. */
function flags() {
  return el('div', 'flags', ALL.map((lang) => {
    const b = el('button', lang === s ? 'flag on' : 'flag', lang.flag);
    b.setAttribute('aria-label', lang.languageName);
    b.setAttribute('aria-pressed', String(lang === s));
    b.onclick = () => {
      if (lang !== s) {
        s = lang;
        render();
      }
    };
    return b;
  }));
}

// ---- The code ----

function qr() {
  qrCanvas = el('canvas', 'qr');
  qrCanvas.setAttribute('role', 'img');
  qrCanvas.setAttribute('aria-label', 'QR');
  return qrCanvas;
}

function tick() {
  clearTimeout(timer);
  if (!qrCanvas || !k) return;
  const t = G.timeStep(Math.floor(Date.now() / 1000));
  if (t !== lastT) {
    lastT = t;
    const code = screen === 'register' ? G.registrationCode(devPk, k, t) : G.liveCode(devPk, k, t);
    draw(screen === 'register' ? G.registrationQr(code) : G.liveQr(code));
    requestAnimationFrame(fitQr);
  }
  timer = setTimeout(tick, 10_000 - (Date.now() % 10_000) + 20);
}

/**
 * Black on white, 4-module quiet zone, whole device pixels per module; by default as wide as the
 * screen allows. [room] is the most CSS pixels it may take.
 */
function draw(code, canvas = qrCanvas, room = qrRoom || Math.min(document.documentElement.clientWidth, window.innerHeight * 0.62)) {
  const n = code.size + 8;
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.max(1, Math.floor((room * dpr) / n));
  const side = n * scale;
  if (canvas === qrCanvas) qrModules = n;
  canvas.width = canvas.height = side;
  canvas.style.width = canvas.style.height = `${side / dpr}px`;
  const c = canvas.getContext('2d');
  c.fillStyle = '#fff';
  c.fillRect(0, 0, side, side);
  c.fillStyle = '#000';
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      if (code.getModule(x, y)) c.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale);
    }
  }
}

/**
 * Shrinks the QR until what must be seen fits on the first screen: on the code screen the whole QR,
 * on the link screen Done too. Never below 70% of the screen's width (the Android app's floor, so
 * the reader still reads it at 5–10 cm), rounded up to whole device pixels per module; on a very
 * small screen the page then scrolls.
 */
function fitQr() {
  if (!qrCanvas?.isConnected) return;
  const last = screen === 'register' ? document.querySelector('main .button.primary') : qrCanvas;
  if (!last) return;
  const over = last.getBoundingClientRect().bottom + window.scrollY + 12 - window.innerHeight;
  if (over <= 0) return;
  const now = qrCanvas.getBoundingClientRect().height;
  const dpr = window.devicePixelRatio || 1;
  const floor = (Math.ceil((document.documentElement.clientWidth * 0.7 * dpr) / qrModules) * qrModules) / dpr;
  const room = Math.max(floor, now - over);
  if (room < now - 1) {
    qrRoom = room;
    lastT = -1;
    tick();
  }
}

/** Something above the QR changed size (a warning came or went): size the QR again. */
function refit() {
  if (!qrCanvas?.isConnected) return;
  qrRoom = 0;
  lastT = -1;
  tick();
}

addEventListener('resize', () => {
  qrRoom = 0;
  if (qrCanvas) {
    lastT = -1;
    tick();
  }
});

// ---- Clock, storage and screen warnings ----

function clockBox() {
  warn.clock = el('div', 'banners');
  fillBanners();
  return warn.clock;
}

function noteBox() {
  warn.note = el('div', 'banners');
  fillBanners();
  return warn.note;
}

function fillBanners() {
  warn.clock?.replaceChildren(clockOff ? el('p', 'banner', s.clockOff(clockOff)) : '');
  warn.note?.replaceChildren(keptData === false ? el('p', 'banner soft', s.storageWarning) : '');
  refit();
}

/**
 * Compares the phone clock with the host's, only when there's a connection: members run out of
 * data, so the code never waits for this. The Date header has whole seconds; the reader allows
 * codes up to 20 s behind or 10 s ahead, so warn beyond 5 s, as the Android app does.
 */
async function checkClock() {
  if (!navigator.onLine) return;
  try {
    const t0 = Date.now();
    const r = await fetch(`manifest.webmanifest?clock=${t0}`, { method: 'HEAD', cache: 'no-store' });
    const t1 = Date.now();
    const host = Date.parse(r.headers.get('Date') ?? '');
    if (!host || t1 - t0 > 3000) return;
    const off = Math.abs((t0 + t1) / 2 - (host + 500));
    clockOff = off > 5000 ? Math.round(off / 1000) : 0;
    fillBanners();
  } catch {
    // offline or the host didn't answer: say nothing
  }
}

setInterval(() => {
  if (document.visibilityState === 'visible' && k) checkClock();
}, 10 * 60_000);

async function keepAwake() {
  try {
    if (!wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch {
    wakeLock = null; // not allowed here (e.g. low battery); the phone's own timeout applies
  }
}

let wasHidden = false;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    wasHidden = true;
    clearTimeout(timer);
    return;
  }
  if (!wasHidden) return;
  wasHidden = false;
  if (screen === 'install' && standalone()) location.reload();
  newVisit();
  render();
  if (k) checkClock();
});

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  if (screen === 'install') render();
});

addEventListener('appinstalled', () => {
  installed = true;
  installEvent = null;
  if (screen === 'install') render();
});

// ---- Helpers ----

function el(tag, cls, content) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (Array.isArray(content)) e.append(...content);
  else if (content != null) e.textContent = content;
  return e;
}

start();
