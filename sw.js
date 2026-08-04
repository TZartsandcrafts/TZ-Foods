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
var CACHE_NAME = 'foodcode-shell-v2';
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
  event.respondWith(
    fetch(req).then(function(res){
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
