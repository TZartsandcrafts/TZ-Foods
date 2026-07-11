// Service worker for 食材库存 Pantry Tracker
// Caches the app shell (same-origin files only) so the app opens instantly and works offline
// after the first successful load. Cross-origin requests (Open Food Facts API, any AI proxy
// you configure) are intentionally NOT intercepted here - they always go straight to the
// network, since caching/offline-serving API responses would show stale product data.

var CACHE_NAME = 'pantry-shell-v2';
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

  event.respondWith(
    caches.match(req).then(function(cached){
      var networkFetch = fetch(req).then(function(res){
        if(res && res.status === 200){
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
        }
        return res;
      }).catch(function(){
        return cached; // offline and not cached -> nothing we can do for this request
      });
      // Cache-first for speed + offline support; refresh cache in the background.
      return cached || networkFetch;
    })
  );
});
