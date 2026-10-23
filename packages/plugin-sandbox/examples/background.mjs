let count = 0
const timer = setInterval(() => {
  postMessage({ type: "tick", count: ++count })
}, 1000)

onmessage = ({ data }) => {
  if (data.type === "status") postMessage({ type: "status", count })
  if (data.type === "stop") {
    clearInterval(timer)
    postMessage({ type: "stopped", count })
    close()
  }
}

postMessage({ type: "ready" })
