import type { Mount } from "@eidos.space/plugin-sdk"

const mount: Mount = (ctx, root) => {
  const background = ctx.capabilities.background!
  const documentApi = ctx.capabilities.document!
  const title = document.createElement("h1")
  title.textContent = "WebSocket Workbench"
  const description = document.createElement("p")
  description.textContent =
    "Send this sample to ws://127.0.0.1:8787/echo. All open requests share one background connection."
  const preview = document.createElement("pre")
  const output = document.createElement("pre")
  const connectionCard = document.createElement("section")
  connectionCard.setAttribute("aria-live", "polite")
  connectionCard.style.cssText =
    "padding:20px;border:1px solid currentColor;border-radius:12px;margin:20px 0"
  const status = document.createElement("strong")
  status.style.cssText = "display:block;font-size:22px"
  status.textContent = "等待发送"
  const metrics = document.createElement("p")
  metrics.style.cssText = "font-size:28px;font-weight:600;margin:12px 0"
  metrics.textContent = "文件 A / 文件 B → 同一个后台 → 一个 WebSocket"
  const identity = document.createElement("div")
  identity.style.cssText = "font:12px/1.8 monospace;overflow-wrap:anywhere"
  identity.textContent = "发送后显示共享连接编号和本连接累计消息序号。"
  const hint = document.createElement("p")
  hint.textContent =
    "验证方法：发送此文件 → 关闭文件 → 打开另一个 .wsreq 并发送。编号不变、序号继续增加，就复用了连接。"
  connectionCard.append(status, metrics, identity, hint)
  const button = document.createElement("button")
  button.textContent = "Send sample"
  output.textContent = "Ready · no data sent"
  root.style.cssText =
    "padding:24px;max-width:880px;margin:auto;font:14px/1.6 system-ui"
  for (const element of [preview, output])
    element.style.cssText =
      "white-space:pre-wrap;overflow-wrap:anywhere;padding:16px;border:1px solid currentColor;border-radius:8px"
  button.style.cssText = "padding:8px 16px;font:inherit;cursor:pointer"
  root.append(title, description, connectionCard, preview, button, output)
  void documentApi
    .read()
    .then((value) => {
      if (!ctx.signal.aborted) preview.textContent = value.text
    })
    .catch((error: unknown) => {
      output.textContent = String(error)
    })
  button.onclick = () => {
    button.disabled = true
    output.textContent = "Connecting / waiting for echo…"
    status.textContent = "正在发送…"
    void (async () => {
      try {
        const { text } = await documentApi.read()
        if (ctx.signal.aborted) return
        preview.textContent = text
        const response = await background.request({ command: "send", text })
        if (!ctx.signal.aborted) {
          output.textContent = JSON.stringify(response, null, 2)
          if (
            response &&
            typeof response === "object" &&
            !Array.isArray(response) &&
            response.ok === true
          ) {
            status.textContent = response.reused
              ? "✓ 复用了已有 WebSocket"
              : "● 本次建立了新 WebSocket"
            metrics.textContent = `1 条连接 · 第 ${String(response.messageNumber)} 条消息`
            identity.textContent = `连接编号：${String(response.connection)}\n建立时间：${new Date(Number(response.connectedAt)).toLocaleTimeString()} · 本次耗时：${String(response.elapsedMs)} ms`
            identity.style.whiteSpace = "pre-wrap"
            hint.textContent = response.reused
              ? "本次发送没有新建连接。后台在文件关闭或切换后继续持有这条连接。"
              : "现在关闭此文件，打开另一份样本并发送：应显示“复用了已有 WebSocket”，消息序号变为 2。"
          } else {
            status.textContent = "发送失败"
            hint.textContent =
              "检查 Python 服务是否运行；再次点击发送可重试。下方保留错误详情。"
          }
        }
      } catch (error) {
        if (!ctx.signal.aborted) {
          status.textContent = "发送失败"
          output.textContent = String(error)
        }
      } finally {
        if (!ctx.signal.aborted) button.disabled = false
      }
    })()
  }
  // Disposing a view must not stop the shared background.
}
export default mount
