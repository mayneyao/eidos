import type {
  Mount,
  Disposable,
  BackgroundMessage,
} from "@eidos.space/plugin-sdk"
import { readRows, type HistoryRow } from "./history"
const mount: Mount = (ctx, root) => {
  root.innerHTML = `<style>
    .history { box-sizing: border-box; max-width: 888px; margin: 0 auto; padding: 32px 24px; font: 14px/1.6 system-ui; color: var(--foreground); }
    .history p { margin: 8px 0 20px; } .history p:empty { display: none; }
    .history .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .history button,.history input,.history select { font: inherit; color: inherit; background: var(--background); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; }
    .history button { cursor: pointer; } .history button:disabled { opacity: .5; cursor: default; }
    .history input { flex: 1; min-width: 140px; } .history table { width: 100%; border-collapse: collapse; text-align: left; }
    .history td,.history th { border-bottom: 1px solid var(--border); padding: 10px 4px; } .history td:first-child { overflow-wrap: anywhere; }
    .history td button { border: 0; padding: 0; text-align: left; background: transparent; }
    .history .error { color: var(--destructive); }
  </style><section class="history">
  <div class="toolbar"><input type="search" placeholder="搜索文件" aria-label="搜索文件"><select aria-label="排序"><option value="recent">最近打开</option><option value="count">打开次数</option></select></div>
  <p data-status role="status">加载中…</p><p class="error" data-error role="alert"></p>
  <table><thead><tr><th>文件</th><th>次数</th><th>最近打开</th></tr></thead><tbody></tbody></table><p data-empty hidden>暂无记录</p></section>`
  const select = <T extends Element>(selector: string) =>
    root.querySelector<T>(selector)!
  const search = select<HTMLInputElement>("input")
  const order = select<HTMLSelectElement>("select")
  const status = select<HTMLElement>("[data-status]")
  const error = select<HTMLElement>("[data-error]")
  let rows: HistoryRow[] = []
  let active = false
  let disposed = false
  let busy = false
  let subscription: Disposable | undefined
  function stopped() {
    active = false
    subscription?.dispose()
    subscription = undefined
    if (disposed) return
    status.textContent = "记录暂不可用，请重新打开面板。"
  }
  function render() {
    const filtered = rows
      .filter((row) =>
        row.path.toLowerCase().includes(search.value.toLowerCase())
      )
      .sort((a, b) =>
        order.value === "count"
          ? b.count - a.count
          : b.lastOpenedAt - a.lastOpenedAt
      )
    const body = select<HTMLTableSectionElement>("tbody")
    body.replaceChildren()
    for (const row of filtered.slice(0, 200)) {
      const tr = document.createElement("tr")
      const file = document.createElement("td")
      const button = document.createElement("button")
      button.textContent = row.path
      button.onclick = () => {
        void ctx.capabilities.ui.openFile!(row.path).catch((cause: Error) => {
          if (!disposed) error.textContent = cause.message
        })
      }
      file.append(button)
      const count = document.createElement("td")
      count.textContent = String(row.count)
      const date = document.createElement("td")
      date.textContent = new Date(row.lastOpenedAt).toLocaleString()
      tr.append(file, count, date)
      body.append(tr)
    }
    const empty = select<HTMLElement>("[data-empty]")
    empty.hidden = filtered.length > 0
    empty.textContent = search.value ? "没有匹配的文件" : "暂无记录"
  }
  async function request(command = "status") {
    if (!(await ctx.capabilities.background!.isRunning())) {
      stopped()
      return
    }
    if (disposed) return
    const value = await ctx.capabilities.background!.request({ command })
    if (
      command === "prepare-stop" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.error
    )
      throw new Error(String(value.error))
    accept(value)
  }
  function accept(value: BackgroundMessage) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("后台返回的数据无效")
    if (disposed) return
    if (!Array.isArray(value.rows))
      throw new Error(String(value.error || "无法读取历史"))
    const nextRows = readRows(value.rows)
    const changed = JSON.stringify(rows) !== JSON.stringify(nextRows)
    rows = nextRows
    error.textContent = value.error ? String(value.error) : ""
    const initial = status.textContent === "加载中…"
    status.textContent = ""
    if (changed || initial) render()
  }
  async function run(action: () => Promise<void>) {
    if (busy) return
    busy = true
    try {
      await action()
    } catch (cause) {
      if (!disposed) {
        status.textContent = ""
        error.textContent =
          cause instanceof Error ? cause.message : String(cause)
      }
    } finally {
      busy = false
    }
  }
  async function connect() {
    if (disposed) return
    active = true
    subscription?.dispose()
    subscription = await ctx.capabilities.background!.onMessage((message) => {
      if (
        !message ||
        typeof message !== "object" ||
        Array.isArray(message) ||
        message.type !== "history"
      )
        return
      try {
        accept(message.data!)
      } catch (cause) {
        if (!disposed)
          error.textContent =
            cause instanceof Error ? cause.message : String(cause)
      }
    })
    if (disposed) {
      subscription.dispose()
      return
    }
    await request()
  }
  search.oninput = order.onchange = render
  const refresh = () =>
    run(async () => {
      const running = await ctx.capabilities.background!.isRunning()
      if (disposed) return
      if (!running) stopped()
      else if (!active) await connect()
    })
  const timer = setInterval(() => {
    void refresh()
  }, 2000)
  void run(async () => {
    if (!(await ctx.capabilities.background!.isRunning())) {
      if (disposed) return
      await ctx.capabilities.background!.start()
    }
    await connect()
  })
  ctx.subscriptions.add({
    dispose() {
      disposed = true
      clearInterval(timer)
      subscription?.dispose()
    },
  })
}
export default mount
