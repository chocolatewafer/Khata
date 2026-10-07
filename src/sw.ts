/// <reference lib="webworker" />
// Built separately into dist/sw.js by the plugin in vite.config.ts.
import { dueAlerts } from './lib/alerts';
import type { Snapshot } from './lib/notify';

declare const __PRECACHE__: string[];
declare const __VERSION__: string;

// app routes and assets live under the worker's scope ("/" or "/Khata/")
const at = (path: string) => new URL(path.replace(/^\//, ''), (self as unknown as ServiceWorkerGlobalScope).registration.scope).href;

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `khata-${__VERSION__}`;

sw.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(__PRECACHE__)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // the app is one page; every route (including /silent_add from automations) is served by index.html
    // a host without an SPA rewrite answers 404 for /silent_add etc.; serve the cached shell instead
    const shell = () => caches.match(at('/')).then((r) => r ?? Response.error());
    e.respondWith(fetch(req).then((res) => (res.status === 404 ? shell() : res)).catch(shell));
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});

/**
 * Opens the app's database only if it already exists. Opening a missing database would create an
 * empty one, and Dexie would then skip seeding default accounts and categories.
 */
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const r = indexedDB.open('khata');
    r.onupgradeneeded = () => r.transaction?.abort();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.onblocked = () => resolve(null);
  });
}
const req = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => ((r.onsuccess = () => res(r.result)), (r.onerror = () => rej(r.error))));

async function check() {
  if (Notification.permission !== 'granted') return;
  const db = await openDb();
  if (!db) return;
  try {
    if (!db.objectStoreNames.contains('kv') || !db.objectStoreNames.contains('txs')) return;
    const kv = db.transaction('kv').objectStore('kv');
    const snap = (await req(kv.get('snapshot')))?.value as Snapshot | undefined;
    if (!snap) return;
    const firedList = ((await req(db.transaction('kv').objectStore('kv').get('fired')))?.value as string[]) ?? [];
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const logged = await req(db.transaction('txs').objectStore('txs').index('date').count(today));
    const fired = new Set(firedList);
    const fresh = dueAlerts({ ...snap, today, hhmm: now.toTimeString().slice(0, 5), loggedToday: logged > 0 }).filter((a) => !fired.has(a.key));
    for (const a of fresh) {
      await sw.registration.showNotification(a.title, { body: a.body, icon: at('/icons/icon-192.png'), badge: at('/icons/badge.png'), tag: a.key, data: { url: at(a.url) } });
      fired.add(a.key);
    }
    if (fresh.length) await req(db.transaction('kv', 'readwrite').objectStore('kv').put({ key: 'fired', value: [...fired].slice(-300) }));
  } finally {
    db.close();
  }
}

sw.addEventListener('periodicsync', (e) => {
  const ev = e as ExtendableEvent & { tag: string };
  if (ev.tag === 'khata-check') ev.waitUntil(check());
});

sw.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data?.url as string) ?? at('/');
  e.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list[0] as WindowClient | undefined;
      return open ? open.focus().then((c) => c.navigate(url)) : sw.clients.openWindow(url);
    }),
  );
});
