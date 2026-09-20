/* Service Worker：离线可用 + 缓存本应用静态资源 */
const CACHE = 'focus-plan-v81';
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
  './js/queue.js',
  './js/milestones.js',
  './js/app.js',
  './manifest.webmanifest',
  './icon.svg',
  './assets/honor/sumneu.jpg',
  './assets/honor/aisi.jpg',
  './assets/honor/xinxin.jpg',
  './assets/honor/zhi.png'
];

self.addEventListener('install', function (e) {
  /* ⚠ v75：原来是 c.addAll(ASSETS) —— 只要有一个文件当时没传上去，
     整个安装就 reject，SW 永远装不上（用户看到的还是老 SW 甚至没有 SW）。
     改成逐个下载、逐个判 ok，一个失败不影响其它。 */
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return fetch(u, { cache: 'no-store' }).then(function (r) {
          if (r && r.ok) return c.put(u, r);
        }).catch(function () { /* 单个失败不影响整体 */ });
      }));
    }).then(function () { return self.skipWaiting(); })
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

/* ⚠ v75：只把 「真的拿到了 200」 的响应写进缓存。
   以前是无条件 c.put(...) —— 只要某一次请求赶上文件还没传上去（404），
   那个 404 就会被存下来，之后每次刷新都从缓存里拿 404：
   表现就是「页面能打开、但完全没样式 / 某个 js 永远不生效」，而且刷新治不好。 */
function putSafe(req, res) {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
  }
  return res;
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  if (isDoc(e.request)) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(function (res) {
        return putSafe(e.request, res);
      }).catch(function () {
        return caches.match(e.request).then(function (hit) { return hit || caches.match('./index.html'); });
      })
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) { return putSafe(e.request, res); });
    })
  );
});