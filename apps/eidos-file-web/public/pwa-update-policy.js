const EIDOS_FILE_UPDATE_PROMPT_CACHE =
  "eidos-file-pwa-update-prompt-ready-v1"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .has(EIDOS_FILE_UPDATE_PROMPT_CACHE)
      .then((promptReady) => {
        if (!promptReady) return self.skipWaiting()
      })
      .catch(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim()
      if (await caches.has(EIDOS_FILE_UPDATE_PROMPT_CACHE)) return
      const legacyClients = await self.clients.matchAll({ type: "window" })
      await Promise.all(
        legacyClients.map((client) =>
          client.navigate(client.url).catch(() => undefined)
        )
      )
    })()
  )
})
