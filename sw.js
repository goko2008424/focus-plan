/* Service Worker：离线可用 + 缓存本应用静态资源 */
const CACHE = 'focus-plan-v68';
const ASSETS = [
  './',
  './index.html',
  './version.html',
  './css/style.css',
  './js/store.js',
  './js/ui.js',
  './js/tasks.js',
  './js/timeline.js',
  './js/stats.js',
  './js/settings.js',
  './js/sport.js',
  './js/lecture.js',
  './js/calendar.js',
  './js/link.js',
  './js/demo.js',
  './js/app.js',
  './manifest.webmanifest',
  './icon.svg',
  './assets/honor/sumneu.jpg',
  './assets/honor/aisi.jpg',
  './assets/honor/xinxin.jpg',
  './assets/honor/zhi.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* v67：页面本体（打开网址 / index.html / version.html）必须走 network-first。
   ⚠️ 以前一律 cache-first，于是老 SW 把 index.html 自己也缓存住了：
   你在 GitHub 传了新版本，第一次刷新拿到的仍然是缓存里的旧页面 ——
   表现就是「传了但是没变化」。
   带 ?v= 的 js/css 不需要特殊照顾（版本号一改 URL 就变了，天然不会命中老缓存），
   继续 cache-first 保证离线可用。 */
function isDoc(req) {
  if (req.mode === 'navigate') return true;
  const p = new URL(req.url).pathname;
  return p.endsWith('/index.html') || p.endsWith('/version.html');
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  if (isDoc(e.request)) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () {
        return caches.match(e.request).then(function (hit) { return hit || caches.match('./index.html'); });
      })
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      });
    })
  );
});