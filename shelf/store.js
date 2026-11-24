// Everything 연구실 책장 keeps on this device, in IndexedDB:
//   kv      small values: sign-in token, settings, the last library and reading positions seen (for a fast, offline start)
//   files   PDF bytes of files opened or fetched ahead (so they open at once, and without a connection)
//   thumbs  first-page pictures
//   texts   page texts, page numbering and headings (for search)
//   marks   highlights and underlines, with a flag while changes still wait to reach the server
const DB_NAME = 'bookshelf';
const STORES = ['kv', 'files', 'thumbs', 'texts', 'marks'];
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => { db.close(); dbp = null; };
      resolve(db);
    };
    r.onerror = () => { dbp = null; reject(r.error); };
    r.onblocked = () => reject(new Error('blocked'));
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('aborted'));
  }));
}

export const get = (store, key) => tx(store, 'readonly', (s) => s.get(key));
export const put = (store, key, value) => tx(store, 'readwrite', (s) => { s.put(value, key); });
export const del = (store, key) => tx(store, 'readwrite', (s) => { s.delete(key); });
export const keys = (store) => tx(store, 'readonly', (s) => s.getAllKeys());
export const clear = (store) => tx(store, 'readwrite', (s) => { s.clear(); });

export async function entries(store) {   // [key, value] pairs, read in one transaction
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly'), s = t.objectStore(store);
    const k = s.getAllKeys(), v = s.getAll();
    t.oncomplete = () => resolve(k.result.map((key, i) => [key, v.result[i]]));
    t.onerror = () => reject(t.error);
  });
}

export async function has(store, key) {
  return tx(store, 'readonly', (s) => s.count(key)).then((n) => n > 0);
}

// Total bytes of the PDFs kept on this device
export async function filesSize() {
  const db = await open();
  return new Promise((resolve, reject) => {
    let total = 0;
    const t = db.transaction('files', 'readonly');
    const c = t.objectStore('files').openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { total += (cur.value && cur.value.size) || 0; cur.continue(); } };
    t.oncomplete = () => resolve(total);
    t.onerror = () => reject(t.error);
  });
}

export async function persist() {   // ask the browser not to clear these on its own
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* ignore */ }
  return false;
}
export async function estimate() {
  try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (e) { /* ignore */ }
  return null;
}
