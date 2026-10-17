// Offline support. The build's files have hashed names, so nothing is listed up front: every GET of the game
// (and of the howler CDN script and the fonts) is cached as it is first used.
//  - the page itself (navigation) goes to the network first, so a new version shows up on the next visit, and
//    falls back to the cache when offline;
//  - hashed files under assets/ never change, so they come from the cache; after each page load the ones the
//    new page no longer uses are dropped, so the cache does not grow with every release;
//  - everything else is served from the cache while a fresh copy is fetched in the background.
const CACHE = "xeno-v2";
const SHELL = ["./", "manifest.json", "icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheable = (url) =>
  url.origin === self.location.origin || /cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host);
const isHashedAsset = (url) => url.origin === self.location.origin && /\/assets\//.test(url.pathname);
const keep = (res) => res && (res.ok || res.type === "opaque");

/** Drops cached hashed files that the given page no longer mentions. */
async function prune(cache, html) {
  const used = new Set([...html.matchAll(/assets\/[\w.-]+/g)].map((m) => m[0]));
  for (const req of await cache.keys()) {
    const url = new URL(req.url);
    if (isHashedAsset(url) && ![...used].some((u) => url.pathname.endsWith(u))) await cache.delete(req);
  }
}

async function networkFirst(req, cache) {
  try {
    const res = await fetch(req);
    if (keep(res)) {
      cache.put(req, res.clone());
      if (req.mode === "navigate") res.clone().text().then((html) => prune(cache, html)).catch(() => {});
    }
    return res;
  } catch {
    return (await cache.match(req)) || (await cache.match("./")) || Response.error();
  }
}

async function cacheFirst(req, cache) {
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (keep(res)) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cache) {
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (keep(res)) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit || Response.error());
  return hit || fresh;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!cacheable(url)) return;
  e.respondWith(
    caches.open(CACHE).then((cache) => {
      if (req.mode === "navigate" || url.pathname.endsWith("/manifest.json")) return networkFirst(req, cache);
      if (isHashedAsset(url)) return cacheFirst(req, cache);
      return staleWhileRevalidate(req, cache);
    }),
  );
});
