// cache all esm.sh requests

const CACHE_NAME = "esm-cache-v1"
const ESM_DOMAIN = "esm.sh"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache")
      return cache.addAll([]) // Pre-cache any essential assets if needed
    })
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url)

  if (requestUrl.hostname === ESM_DOMAIN) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          if (response) {
            return response
          }
          return fetch(event.request).then((networkResponse) => {
            cache.put(event.request, networkResponse.clone())
            return networkResponse
          })
        })
      })
    )
  } else {
    // For non-esm.sh requests, just fetch from network.
    // Or handle other caching strategies if needed.
    event.respondWith(fetch(event.request))
  }
})
