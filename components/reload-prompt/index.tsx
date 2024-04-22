import { useRegisterSW } from "virtual:pwa-register/react"

const intervalMS = 60 * 60 * 1000

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log("SW Registered: " + r)
      r &&
        setInterval(() => {
          r.update()
        }, intervalMS)
    },
    onRegisterError(error) {
      console.log("SW registration error", error)
    },
  })

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <div>
      {(offlineReady || needRefresh) && (
        <div className="fixed bottom-0 right-0 z-10 m-4 rounded border border-gray-500 bg-primary-foreground p-3 text-black shadow  dark:text-white">
          <div className="mb-2">
            {offlineReady ? (
              <span>App ready to work offline</span>
            ) : (
              <span>
                New content available, click on reload button to update.
              </span>
            )}
          </div>
          {needRefresh && (
            <button
              className="mr-2 rounded border border-gray-500 px-3 py-1 outline-none"
              onClick={() => updateServiceWorker(true)}
            >
              Reload
            </button>
          )}
          <button
            className="rounded border border-gray-500 px-3 py-1 outline-none"
            onClick={() => close()}
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}
