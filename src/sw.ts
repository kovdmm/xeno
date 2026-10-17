/// <reference lib="webworker" />
// Offline support (the service worker). The build's files have hashed names, so nothing is listed up front:
// every GET of the game (and of the howler CDN script and the fonts) is cached as it is first used.
//  - the page itself (navigation) goes to the network first, so a new version shows up on the next visit, and
//    falls back to the cache when offline;
//  - hashed files under assets/ never change, so they come from the cache; after each page load the ones the
//    new page no longer uses are dropped, so the cache does not grow with every release;
//  - everything else is served from the cache while a fresh copy is fetched in the background.
// It is built to sw.js by the service-worker plugin in vite.config.ts (it is not part of the app bundle).
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = "xeno-v2";
const SHELL = ["./", "manifest.json", "icon.svg"];

sw.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

const cacheable = (url: URL) =>
  url.origin === sw.location.origin || /cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host);
const isHashedAsset = (url: URL) => url.origin === sw.location.origin && /\/assets\//.test(url.pathname);
const keep = (res: Response | undefined): res is Response => !!res && (res.ok || res.type === "opaque");

/** Drops cached hashed files that the given page no longer mentions. */
async function prune(cache: Cache, html: string) {
  const used = new Set([...html.matchAll(/assets\/[\w.-]+/g)].map((m) => m[0]));
  for (const req of await cache.keys()) {
    const url = new URL(req.url);
    if (isHashedAsset(url) && ![...used].some((u) => url.pathname.endsWith(u))) await cache.delete(req);
  }
}

async function networkFirst(req: Request, cache: Cache): Promise<Response> {
  try {
    const res = await fetch(req);
    if (keep(res)) {
      cache.put(req, res.clone());
      if (req.mode === "navigate")
        res
          .clone()
          .text()
          .then((html) => prune(cache, html))
          .catch(() => {});
    }
    return res;
  } catch {
    return (await cache.match(req)) || (await cache.match("./")) || Response.error();
  }
}

async function cacheFirst(req: Request, cache: Cache): Promise<Response> {
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (keep(res)) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req: Request, cache: Cache): Promise<Response> {
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (keep(res)) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit || Response.error());
  return hit || fresh;
}

sw.addEventListener("fetch", (e) => {
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
