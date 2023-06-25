export const initWs = () => {
  const ws = new WebSocket("ws://localhost:3333")

  ws.onopen = () => {
    console.log("Connected to server")
  }
  ws.onmessage = (e) => {
    console.log("Received message from server:", e.data)
    ws.send(e.data)
  }
}
