// Service worker for 食法典 FoodCode
// Caches the app shell (same-origin files only) so the app works offline after the first
// successful load. Cross-origin requests (Open Food Facts API, any AI proxy you configure)
// are intentionally NOT intercepted here - they always go straight to the network, since
// caching/offline-serving API responses would show stale product data.
//
// v2 switched the fetch strategy from cache-first to network-first (see below) - this is a
// real bugfix, not a style preference. See README 9.59 for the full story: because index.html
// is a single file that changes on every deploy while sw.js itself usually doesn't, the browser
// often has no reason to even notice a new service worker is available, so the old cache-first
// handler could keep serving a stale, already-superseded copy of index.html/app JS for a long
// time - occasionally causing real bugs (a whole class of "acts like an older version of the
// app" symptoms, including a case where an older JS build's item-saving code didn't know about
// a newer data field and silently dropped it on save). Network-first fixes this at the root:
// as long as the device is online, every load fetches the current index.html straight from the
// network (and refreshes the cache for later); the cache is only ever used as an offline
// fallback, never as a "good enough, don't bother checking" substitute for the real thing.
var CACHE_NAME = 'foodcode-shell-v5';
// v5 (README 9.224): the fetch below now uses cache:'no-cache' instead of 'no-store'. Both guarantee
// a launch never runs a stale build (the server is asked every time), but 'no-store' also threw away the
// browser's stored copy, so EVERY launch re-downloaded the whole ~2MB index.html even when nothing had
// changed. 'no-cache' means "revalidate with the server first": if the file is unchanged the server
// answers 304 (a few hundred bytes) and the stored copy is used; if it changed, the new file is
// downloaded in full. (v4 / README 9.223's "serve cache after 3s" idea was withdrawn: it could
// open the previous build, which is misleading.)
var APP_SHELL = [
  './',
  './index.html'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache){ return cache.addAll(APP_SHELL); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  var req = event.request;
  var url = new URL(req.url);

  // Only handle same-origin GET requests; let everything else (API calls, POSTs) pass through untouched.
  if(req.method !== 'GET' || url.origin !== self.location.origin){
    return;
  }

  // Network-first: always try the network so an online device gets the current app build.
  // Only fall back to whatever's cached if the network request actually fails (offline, or a
  // genuine network error) - that's the offline-support case this cache exists for, not a
  // freshness shortcut for the common online case.
  //
  // README 9.115: plain fetch(req) here was NOT actually a guarantee of freshness - fetch()
  // still obeys ordinary HTTP caching unless told not to, so if GitHub Pages sends the served
  // files out with any Cache-Control max-age (it does by default), the browser's own HTTP cache
  // layer could quietly satisfy this "network" request from disk without a real round-trip to
  // the server, especially right after resuming a backgrounded PWA - this is what was actually
  // causing the "app randomly reverts to an old version, force-quitting and reopening fixes it"
  // symptom, not a service-worker-cache bug (the SW-level cache logic below this fetch was
  // already correct). {cache:'no-store'} makes this fetch bypass HTTP caching entirely, so
  // "network-first" now really means "always get the current bytes from the server" whenever
  // the device is online, closing that loophole at its actual source.
  // README 9.224: 'no-store' -> 'no-cache'. Same guarantee (always revalidated against the server, never
  // served from max-age), but an unchanged file now costs a tiny 304 instead of a full re-download.
  event.respondWith(
    fetch(req, {cache:'no-cache'}).then(function(res){
      if(res && res.status === 200){
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
      }
      return res;
    }).catch(function(){
      return caches.match(req); // offline -> serve last-known-good copy; if nothing cached yet, this resolves to undefined and the browser shows its normal offline error
    })
  );
});
