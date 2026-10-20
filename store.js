// The device seed in IndexedDB: 12-byte IV ‖ AES-GCM ciphertext, under a non-extractable
// WebCrypto key kept beside it (DECISIONS.md, 20 Oct). The page can use that key but never read
// its bytes. Browser data is per web address: a new address starts with no key.
const DB = 'gym-access';
const STORE = 'kv';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(result.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  }));
}

/** The stored seed, or null if there is none or it can't be decrypted. Never creates one. */
export async function load() {
  const [wrap, sealed] = await Promise.all([
    run('readonly', (s) => s.get('wrap')),
    run('readonly', (s) => s.get('seed')),
  ]);
  if (!wrap || !sealed) return null;
  try {
    const seed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv }, wrap, sealed.ct));
    return seed.length === 32 ? seed : null;
  } catch {
    return null;
  }
}

/** Replaces any stored seed with a fresh one and returns it. The phone must be linked again. */
export async function reset() {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const wrap = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrap, seed));
  // One transaction, so a crash can't leave a seed with the wrong key.
  await run('readwrite', (s) => { s.put(wrap, 'wrap'); return s.put({ iv, ct }, 'seed'); });
  const check = await load();
  if (!check || check.some((b, i) => b !== seed[i])) throw new Error('key not saved');
  check.fill(0);
  return seed;
}

/**
 * Asks the browser not to clear this app's data when the phone runs low on space. Returns true
 * if it promised, false if it refused, null if this browser can't say.
 */
export async function keepData() {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
