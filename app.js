// Open Gym: the gym check-in code as a home-screen web app, with the same codes as the Android app (DECISIONS.md, 20 Oct).
// Screens: install (in a browser tab), welcome (no key yet), code, register. K lives in RAM only.
import * as G from './gymcrypto.js';
import * as store from './store.js';
import { ALL, ES } from './strings.js';
import { GYM_PK_HEX } from './gym.js';

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
/** A one-off line on the register screen, e.g. "new key saved". */
let note = '';
let message = 0;
let byteIndex = 0;
let installEvent = null;
let wakeLock = null;
let qrCanvas = null;
let banners = null;

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
    note = '';
    render();
  }
});

// ---- Screens ----

function render() {
  clearTimeout(timer);
  qrCanvas = null;
  banners = null;
  document.documentElement.lang = s === ES ? 'es' : 'en';
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
  const link = el('button', 'link', s.registerButton);
  link.onclick = () => go('register');
  return [
    el('header', 'head', [byte, el('div', 'hello', [el('h1', '', greeting), el('p', '', s.motivation[message])]), flags()]),
    bannerBox(),
    qr(),
    el('p', 'hold', s.holdUp),
    el('p', 'hint', s.brightness),
    link,
  ];
}

function registerView() {
  const reset = el('button', 'button', s.resetKey);
  reset.onclick = confirmReset;
  const back = el('button', 'button', s.back);
  back.onclick = () => history.back();
  return [
    el('header', 'head end', [flags()]),
    bannerBox(),
    qr(),
    el('p', 'instructions', s.registerInstructions),
    el('p', 'mono', s.keyId + G.hex(G.keyId(devPk))),
    note ? el('p', 'note', note) : '',
    reset,
    back,
  ];
}

function welcomeView() {
  const make = el('button', 'button primary', s.makeKey);
  const error = el('p', 'warn hidden', s.keyError);
  make.onclick = async () => {
    make.disabled = true;
    try {
      keptData = await store.keepData(); // first, while the tap still counts as the member's choice
      useSeed(await store.reset());
      note = s.keySaved;
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
    error,
    el('p', 'small', s.welcomeLost),
  ];
}

function installView() {
  const install = el('button', 'button primary', s.installButton);
  install.hidden = !installEvent;
  install.onclick = async () => {
    const e = installEvent;
    installEvent = null;
    install.hidden = true;
    await e?.prompt();
  };
  return [
    el('header', 'head end', [flags()]),
    logo(),
    el('h1', 'title', 'Open Gym'),
    el('p', '', s.installIntro),
    install,
    el('p', 'step', s.installAndroid),
    el('p', 'step', s.installFirefox),
    el('p', 'step', s.installIphone),
    el('p', 'step', s.installThen),
    el('p', 'small', s.inAppBrowser),
    el('p', 'credit', 'Byte the dog artwork used with permission'),
  ];
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

function confirmReset() {
  const dialog = el('dialog', 'dialog');
  const cont = el('button', 'button primary', s.resetContinue);
  const back = el('button', 'button', s.back);
  dialog.append(el('h2', '', s.resetTitle), el('p', '', s.resetMessage), el('div', 'row', [back, cont]));
  back.onclick = () => dialog.close();
  dialog.onclose = () => dialog.remove();
  cont.onclick = async () => {
    cont.disabled = true;
    try {
      useSeed(await store.reset());
      note = s.keySaved;
    } catch {
      note = s.keyError;
    }
    dialog.close();
    render();
  };
  document.body.append(dialog);
  dialog.showModal();
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
  }
  timer = setTimeout(tick, 10_000 - (Date.now() % 10_000) + 20);
}

/** Black on white, 4-module quiet zone, whole device pixels per module, as wide as the screen. */
function draw(code) {
  const n = code.size + 8;
  const dpr = window.devicePixelRatio || 1;
  const room = Math.min(document.documentElement.clientWidth, window.innerHeight * 0.62);
  const scale = Math.max(1, Math.floor((room * dpr) / n));
  const side = n * scale;
  qrCanvas.width = qrCanvas.height = side;
  qrCanvas.style.width = qrCanvas.style.height = `${side / dpr}px`;
  const c = qrCanvas.getContext('2d');
  c.fillStyle = '#fff';
  c.fillRect(0, 0, side, side);
  c.fillStyle = '#000';
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      if (code.getModule(x, y)) c.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale);
    }
  }
}

addEventListener('resize', () => {
  if (qrCanvas) {
    lastT = -1;
    tick();
  }
});

// ---- Clock, storage and screen warnings ----

function bannerBox() {
  banners = el('div', 'banners');
  fillBanners();
  return banners;
}

function fillBanners() {
  if (!banners) return;
  banners.replaceChildren(
    clockOff ? el('p', 'banner', s.clockOff(clockOff)) : '',
    keptData === false ? el('p', 'banner soft', s.storageWarning) : '',
  );
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

// ---- Helpers ----

function el(tag, cls, content) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (Array.isArray(content)) e.append(...content);
  else if (content != null) e.textContent = content;
  return e;
}

start();
