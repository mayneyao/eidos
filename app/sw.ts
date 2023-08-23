import { precacheAndRoute } from "workbox-precaching"

import { routes } from "./routes"

declare var self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

// This code executes in its own worker or thread
self.addEventListener("install", (event) => {
  console.log("Service worker installed")
})

self.addEventListener("activate", (event) => {
  console.log("Service worker activated")
})

self.addEventListener("fetch", async (event) => {
  const url = new URL(event.request.url)
  routes.forEach((route) => {
    if (typeof route.pathname === "function") {
      if (route.pathname(url)) {
        event.respondWith(route.handle(event))
      }
    } else if (
      typeof route.pathname === "string" &&
      route.pathname === url.pathname &&
      url.origin === self.location.origin
    ) {
      event.respondWith(route.handle(event))
    }
  })
})
