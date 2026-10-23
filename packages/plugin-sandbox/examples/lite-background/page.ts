import type { Mount } from "@eidos.space/plugin-sdk"

const mount: Mount = (ctx, root) => {
  const background = ctx.capabilities.background!
  const output = document.createElement("pre")
  const increment = document.createElement("button")
  const stop = document.createElement("button")
  increment.textContent = "Increment"
  stop.textContent = "Stop background"
  const showError = (error: unknown) => {
    output.textContent = String(error)
  }
  increment.onclick = () => {
    void background
      .request({ command: "increment" })
      .then((value) => {
        output.textContent = JSON.stringify(value)
      })
      .catch(showError)
  }
  stop.onclick = () => {
    void background.stop().catch(showError)
  }
  root.append(increment, stop, output)
  // Complete mounting before waiting for the user's native permission dialog.
  void (async () => {
    try {
      await background.start()
      ctx.subscriptions.add(
        await background.onMessage((value) => {
          output.textContent = JSON.stringify(value)
        })
      )
      output.textContent = JSON.stringify(
        await background.request({ command: "read" })
      )
    } catch (error) {
      showError(error)
    }
  })()
}
export default mount
