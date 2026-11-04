/* 水球战术模拟器 · Service Worker（离线缓存）
 * 更新页面或资源后，把下面的 CACHE_VERSION 加 1（如 v2），用户下次打开时就会拿到新版本。
 *
 * 策略：
 *  - 安装时预缓存本站所有核心文件（App Shell）。
 *  - 页面导航：网络优先（有网时总能拿到最新版），失败/离线时回退到缓存。
 *  - 本站静态资源（图标、manifest 等）：缓存优先，同时后台刷新（stale-while-revalidate）。
 *  - 跨域的 GSAP（CDN）：首次联网时自动缓存，之后离线也能用；没有缓存时页面自带的备用动画仍可工作。
 */
const CACHE_VERSION = 'v1';
const CACHE_NAME = 'waterpolo-tactics-' + CACHE_VERSION;

// 相对 service-worker.js 所在目录（GitHub Pages 项目站点的子路径也适用）
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];
const GSAP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE);
    // GSAP 是跨域脚本：用 no-cors 取回“不透明响应”，<script> 标签可以直接使用；失败不影响安装
    try { await cache.add(new Request(GSAP_URL, { mode: 'no-cors' })); } catch (e) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('waterpolo-tactics-') && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) 页面导航：网络优先，离线回退到缓存的 index.html
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match(req)) || (await caches.match('./index.html')) || (await caches.match('./'));
      }
    })());
    return;
  }

  // 2) 本站资源 与 GSAP CDN：缓存优先 + 后台刷新
  if (url.origin === self.location.origin || url.href === GSAP_URL) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await network) || Response.error();
    })());
  }
});
