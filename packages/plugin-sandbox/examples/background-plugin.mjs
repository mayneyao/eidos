// Bundled ES module executed in QuickJS. No Node APIs or SDK import in the guest.
let count = 0
const started = Date.now()

onmessage = ({ data }) => {
  if (data.method === "increment") count += data.amount ?? 1
  if (data.method === "increment" || data.method === "status") {
    postMessage({
      requestId: data.requestId,
      count,
      uptimeMs: Date.now() - started,
    })
  } else {
    postMessage({ requestId: data.requestId, error: "Unknown method" })
  }
}

setInterval(() => postMessage({ type: "heartbeat", count }), 1000)
console.log("Background initialized")
