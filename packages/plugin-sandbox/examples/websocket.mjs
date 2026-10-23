// Start websocket-server.py first. The CLI host must grant this origin.
const socket = new WebSocket("ws://127.0.0.1:8787/echo", "echo")

socket.addEventListener("open", () => {
  console.log("connected", socket.protocol)
  socket.send(JSON.stringify({ type: "hello", message: "Hello from QuickJS" }))
})

socket.addEventListener("message", ({ data }) => {
  postMessage({ type: "echo", data: JSON.parse(data) })
  socket.close(1000, "done")
})

socket.addEventListener("error", () => console.error("Connection failed"))
socket.addEventListener("close", ({ code, reason, wasClean }) => {
  postMessage({ type: "closed", code, reason, wasClean })
})
