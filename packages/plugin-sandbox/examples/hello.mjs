console.log("Hello from QuickJS")
await new Promise((resolve) => setTimeout(resolve, 20))
postMessage({ type: "ready", engine: "QuickJS", value: 6 * 7 })
