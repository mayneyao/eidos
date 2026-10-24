// Runs in QuickJS. No DOM, Node, Electron or Eidos filesystem access.
let count = 0
globalThis.onmessage = (event: MessageEvent) => {
  const { requestId, data } = event.data
  if (data?.command === "increment") count++
  postMessage({ requestId, data: { count } })
  postMessage({ type: "count", count })
}
export {}
