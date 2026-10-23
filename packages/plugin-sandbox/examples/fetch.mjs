const response = await fetch("http://127.0.0.1:8787/json", {
  signal: AbortSignal.timeout(2000),
})
if (!response.ok) throw new Error(`HTTP ${response.status}`)
postMessage(await response.json())
