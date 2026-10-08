import { mobileText } from "./locale"
import type { PluginManifest } from "../../plugin-runtime/src/contracts"
import { validateSetting } from "../../plugin-runtime/src/manifest"
import type { NativeRequest } from "./host"
import { validatePackage } from "./validate"

export type InstalledPlugin = {
  manifest: PluginManifest
  enabled: boolean
  revision: string
}
type MarketEntry = {
  id: string
  name: string
  description: string
  version: string
  category?: string
  icon?: PluginManifest["icon"]
}
type Options = {
  native: NativeRequest
  confirm(message: string): Promise<boolean>
  permissions(manifest: PluginManifest): string
  open(id: string, action?: string): Promise<void>
}
const node = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = ""
) => {
  const result = document.createElement(tag)
  result.className = className
  result.textContent = text
  return result
}
const entryKind = (entry: MarketEntry) =>
  (
    ({
      "knowledge-and-writing": mobileText("知识记录"),
      "data-visualization": mobileText("数据视图"),
      themes: mobileText("外观"),
      automation: mobileText("自动化"),
    }) as Record<string, string>
  )[entry.category ?? ""] ?? mobileText("其他")
const usage = (manifest: PluginManifest) => {
  if (manifest.kind === "theme") return mobileText("移动端不支持插件主题")
  if (manifest.placements?.some((p) => p.location === "navigation"))
    return mobileText("页面 · 底部导航")
  if (manifest.placements?.some((p) => p.location === "file/open"))
    return mobileText("视图 · 文件打开方式")
  if (manifest.placements?.some((p) => p.location === "table/view"))
    return mobileText("视图 · 数据表")
  return mobileText("操作 · 插件工具")
}
function icon(
  manifest: Pick<PluginManifest, "icon"> | undefined,
  name: string
) {
  const box = node("span", "pm-icon")
  box.setAttribute("aria-hidden", "true")
  const paths =
    typeof manifest?.icon === "object" &&
    manifest.icon &&
    "paths" in manifest.icon
      ? manifest.icon.paths
      : undefined
  if (paths?.length) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute("viewBox", "0 0 24 24")
    for (const d of paths.slice(0, 32)) {
      if (typeof d !== "string") continue
      const path = document.createElementNS(svg.namespaceURI, "path")
      path.setAttribute("d", d)
      svg.append(path)
    }
    box.append(svg)
  } else box.textContent = Array.from(name)[0]?.toUpperCase() ?? "+"
  return box
}

/** Native shell owns the title/back navigation; this surface owns only plugin content. */
export class PluginManager {
  private installed: InstalledPlugin[] = []
  private entries: MarketEntry[] | null = null
  private tab: "installed" | "market" = "installed"
  private category = mobileText("全部")
  private query = ""
  private disposed = false
  private busy = new Set<string>()
  private catalogRequest: Promise<boolean> | null = null
  private pane = node("div", "pm-pane")
  private list = node("div", "pm-list")
  private status = node("p", "pm-status")
  private toolbar = node("nav", "pm-tabs")
  private detail: HTMLDialogElement | null = null
  private scroll = { installed: 0, market: 0 }
  constructor(
    private root: HTMLElement,
    private options: Options
  ) {
    this.status.setAttribute("role", "status")
    this.toolbar.setAttribute("aria-label", mobileText("插件导航"))
  }
  dispose() {
    this.disposed = true
    this.detail?.close()
  }
  async mount() {
    this.root.classList.add("plugin-manager")
    this.root.replaceChildren(this.toolbar, this.status, this.pane)
    this.renderTabs()
    this.status.textContent = mobileText("正在读取本机插件…")
    try {
      this.installed = await this.options.native<InstalledPlugin[]>("list")
      if (this.disposed) return
      if (this.disposed) return
      this.status.textContent = ""
      this.render()
    } catch (error) {
      this.error(error)
      this.button(mobileText("重试"), () => this.mount(), this.pane)
    }
  }
  private error(error: unknown) {
    if (!this.disposed)
      this.status.textContent =
        error instanceof Error ? error.message : String(error)
  }
  private button(
    text: string,
    action: () => unknown,
    parent: HTMLElement,
    className = ""
  ) {
    const button = node("button", className, text)
    button.type = "button"
    button.onclick = () => {
      button.disabled = true
      void Promise.resolve()
        .then(action)
        .catch((error) => this.error(error))
        .finally(() => {
          button.disabled = false
        })
    }
    parent.append(button)
    return button
  }
  private renderTabs() {
    this.toolbar.replaceChildren()
    for (const [id, title] of [
      ["market", mobileText("发现")],
      [
        "installed",
        `已安装${this.installed.length ? ` ${this.installed.length}` : ""}`,
      ],
    ] as const) {
      const button = this.button(
        title,
        async () => {
          if (this.tab === id) return
          this.scroll[this.tab] = this.pane.scrollTop
          this.tab = id
          this.status.textContent = ""
          this.render()
          if (id === "market") await this.catalog()
        },
        this.toolbar,
        this.tab === id ? "pm-tab selected" : "pm-tab"
      )
      button.setAttribute("aria-current", String(this.tab === id))
    }
    this.button("···", () => this.more(), this.toolbar, "pm-more").setAttribute(
      "aria-label",
      mobileText("更多操作")
    )
  }
  private render() {
    if (this.disposed) return
    this.renderTabs()
    this.pane.replaceChildren()
    if (this.tab === "market") {
      const search = node("input", "pm-search")
      search.type = "search"
      search.placeholder = mobileText("搜索插件")
      search.setAttribute("aria-label", mobileText("搜索插件"))
      search.value = this.query
      search.oninput = () => {
        this.query = search.value
        this.renderList()
      }
      this.pane.append(search)
      const filters = node("div", "pm-filters")
      for (const category of [
        mobileText("全部"),
        mobileText("知识记录"),
        mobileText("数据视图"),
        mobileText("外观"),
        mobileText("自动化"),
      ]) {
        const button = this.button(
          category,
          () => {
            this.category = category
            filters.querySelectorAll("button").forEach((b) => {
              b.classList.toggle("selected", b === button)
              b.setAttribute("aria-pressed", String(b === button))
            })
            this.renderList()
          },
          filters,
          category === this.category ? "selected" : ""
        )
        button.setAttribute("aria-pressed", String(category === this.category))
      }
      this.pane.append(filters)
    } else {
      this.pane.append(
        node("h2", "pm-scope", mobileText("当前 Space")),
        node(
          "p",
          "pm-hint",
          mobileText("开关控制此 Space 的启用状态。移动端不支持插件主题。")
        )
      )
    }
    this.pane.append(this.list)
    this.renderList()
    if (this.tab === "installed")
      this.pane.append(
        node(
          "p",
          "pm-footnote",
          mobileText("插件保留在此设备上。点按插件查看设置、权限与版本。")
        )
      )
    this.pane.scrollTop = this.scroll[this.tab]
  }
  private renderList() {
    this.list.replaceChildren()
    if (this.tab === "installed") {
      if (!this.installed.length) {
        this.list.append(
          node("h2", "pm-empty-title", mobileText("为 Space 添加工具")),
          node(
            "p",
            "pm-hint",
            mobileText("从发现页安装插件，或从右上角导入插件包。")
          )
        )
      }
      for (const plugin of this.installed) {
        const { manifest } = plugin
        const row = node("article", "pm-row")
        const main = this.button(
          "",
          () => this.showDetail(manifest.id),
          row,
          "pm-row-main"
        )
        const text = node("span", "pm-row-text")
        text.append(
          node("strong", "pm-name", manifest.name),
          node("span", "pm-description", usage(manifest)),
          node("span", "pm-version", manifest.version)
        )
        main.append(icon(manifest, manifest.name), text)
        const toggle = this.button(
          "",
          () => this.toggle(plugin, toggle),
          row,
          "pm-toggle"
        )
        toggle.setAttribute("role", "switch")
        toggle.setAttribute(
          "aria-label",
          `${manifest.kind === "theme" ? mobileText("应用") : mobileText("启用")} ${manifest.name}`
        )
        toggle.setAttribute(
          "aria-checked",
          String(manifest.kind !== "theme" && plugin.enabled)
        )
        toggle.disabled =
          manifest.kind === "theme" || this.busy.has(manifest.id)
        this.list.append(row)
      }
    } else {
      if (this.entries === null) {
        this.list.append(
          node(
            "p",
            "pm-hint",
            mobileText("市场需要联网，本机插件仍可离线使用。")
          )
        )
        this.button(
          mobileText("加载插件市场"),
          () => this.catalog(true),
          this.list,
          "pm-retry"
        )
        return
      }
      const entries = this.entries.filter(
        (e) =>
          (this.category === mobileText("全部") ||
            entryKind(e) === this.category) &&
          `${e.name} ${e.description}`
            .toLowerCase()
            .includes(this.query.trim().toLowerCase())
      )
      this.list.append(node("p", "pm-count", `${entries.length} 个插件`))
      for (const entry of entries) {
        const installed = this.installed.find((p) => p.manifest.id === entry.id)
        const row = node("article", "pm-row")
        const main = this.button(
          "",
          () => this.showDetail(entry.id),
          row,
          "pm-row-main"
        )
        const text = node("span", "pm-row-text")
        text.append(
          node("strong", "pm-name", entry.name),
          node("span", "pm-description", entry.description)
        )
        main.append(icon(installed?.manifest ?? entry, entry.name), text)
        if (installed)
          row.append(node("span", "pm-installed", mobileText("已安装")))
        else {
          const install = this.button(
            mobileText("安装"),
            () => this.install(entry.id),
            row,
            "pm-install"
          )
          install.disabled = this.busy.has(entry.id)
        }
        this.list.append(row)
      }
      if (!entries.length)
        this.list.append(
          node(
            "p",
            "pm-hint",
            mobileText("没有匹配的插件，试试其他关键词或分类。")
          )
        )
    }
  }
  private async catalog(force = false) {
    if (this.catalogRequest) return this.catalogRequest
    if (this.entries && !force) return true
    this.catalogRequest = (async () => {
      this.status.textContent = mobileText("正在获取插件市场…")
      try {
        const entries = await this.options.native<MarketEntry[]>("market")
        if (this.disposed) return false
        this.entries = entries.filter((entry) => entry.category !== "themes")
        this.status.textContent = ""
        if (this.tab === "market") this.renderList()
        return true
      } catch (error) {
        this.error(error)
        return false
      } finally {
        this.catalogRequest = null
      }
    })()
    return this.catalogRequest
  }
  private async reload() {
    this.installed = await this.options.native<InstalledPlugin[]>("list")
    if (this.disposed) return
    if (this.disposed) return
    this.renderTabs()
    this.renderList()
  }
  private async toggle(plugin: InstalledPlugin, button: HTMLButtonElement) {
    if (plugin.manifest.kind === "theme") return
    const id = plugin.manifest.id
    if (this.busy.has(id)) return
    this.busy.add(id)
    try {
      if (
        !plugin.enabled &&
        !(await this.options.confirm(this.options.permissions(plugin.manifest)))
      )
        return
      await this.options.native("enable", { id, enabled: !plugin.enabled })
      plugin.enabled = !plugin.enabled
      button.setAttribute("aria-checked", String(plugin.enabled))
    } finally {
      this.busy.delete(id)
    }
  }
  private async install(id?: string) {
    const key = id ?? "import"
    if (this.busy.has(key)) return
    this.busy.add(key)
    this.status.textContent = id
      ? mobileText("正在下载安装包…")
      : mobileText("请选择插件包")
    try {
      const prepared = await this.options.native<{
        manifest: PluginManifest
        origin: string
        raw?: string
        revision: string
      }>(id ? "prepare" : "import", id ? { id } : {})
      if (this.disposed) return
      if (prepared.raw) validatePackage(prepared.raw)
      if (
        !(await this.options.confirm(
          this.options.permissions(prepared.manifest) +
            "\n" +
            prepared.origin +
            "\n" +
            mobileText(
              "安装后将在发起安装的 Space 启用。更新后需重新在其他 Space 启用。"
            )
        ))
      ) {
        this.status.textContent = ""
        return
      }
      if (this.disposed) return
      await this.options.native("install", { revision: prepared.revision })
      this.busy.delete(key)
      await this.reload()
      if (!this.disposed)
        this.status.textContent = mobileText(
          "安装完成，已在发起安装的 Space 启用。"
        )
      this.detail?.close()
    } finally {
      this.busy.delete(key)
    }
  }
  private sheet(title: string) {
    this.detail?.close()
    const dialog = node("dialog", "pm-sheet")
    const heading = node("header", "pm-sheet-header")
    const titleNode = node("h2", "", title)
    titleNode.id = "pm-detail-title"
    dialog.setAttribute("aria-labelledby", titleNode.id)
    heading.append(titleNode)
    this.button("×", () => dialog.close(), heading, "pm-close").setAttribute(
      "aria-label",
      mobileText("关闭")
    )
    const message = node("p", "pm-status")
    message.setAttribute("role", "status")
    // Keep operation errors inside the modal's accessible subtree.
    const observer = new MutationObserver(() => {
      message.textContent = this.status.textContent
    })
    observer.observe(this.status, { childList: true })
    dialog.addEventListener(
      "close",
      () => {
        observer.disconnect()
        dialog.remove()
        if (this.detail === dialog) this.detail = null
      },
      { once: true }
    )
    dialog.append(heading, message)
    document.body.append(dialog)
    this.detail = dialog
    dialog.showModal()
    return dialog
  }
  private more() {
    const dialog = this.sheet(mobileText("更多操作"))
    this.button(
      mobileText("从文件安装"),
      () => this.install(),
      dialog,
      "pm-action"
    )
    this.button(
      mobileText("检查更新"),
      async () => {
        if (await this.catalog(true)) {
          dialog.close()
          this.status.textContent = mobileText(
            "市场版本已刷新，点按插件查看版本与更新。"
          )
        }
      },
      dialog,
      "pm-action"
    )
  }
  private showDetail(id: string) {
    const plugin = this.installed.find((p) => p.manifest.id === id)
    const entry = this.entries?.find((p) => p.id === id)
    if (!plugin && !entry) return
    const dialog = this.sheet(plugin?.manifest.name ?? entry!.name)
    dialog.append(
      node(
        "p",
        "pm-detail-description",
        entry?.description ?? usage(plugin!.manifest)
      )
    )
    dialog.append(
      node(
        "p",
        "pm-version",
        plugin
          ? `已安装 ${plugin.manifest.version}${entry ? ` · 市场 ${entry.version}` : ""}`
          : `版本 ${entry!.version}`
      )
    )
    if (!plugin) {
      this.button(
        mobileText("安装插件"),
        () => this.install(id),
        dialog,
        "pm-action"
      )
      return
    }
    if (entry && entry.version !== plugin.manifest.version)
      this.button(
        `安装市场版本 ${entry.version}`,
        () => this.install(id),
        dialog,
        "pm-action"
      )
    if (plugin.enabled && plugin.manifest.kind !== "theme") {
      this.button(
        mobileText("打开"),
        async () => {
          dialog.close()
          await this.options.open(id)
        },
        dialog,
        "pm-action"
      )
      for (const action of plugin.manifest.actions ?? []) {
        if (
          action.context === "workspace" &&
          plugin.manifest.placements?.some(
            (p) => p.location === "command-palette" && p.action === action.id
          )
        )
          this.button(
            action.title,
            async () => {
              dialog.close()
              await this.options.open(id, action.id)
            },
            dialog,
            "pm-action"
          )
      }
    }
    if (Object.keys(plugin.manifest.settings ?? {}).length)
      this.button(
        mobileText("插件设置"),
        () => this.settings(plugin),
        dialog,
        "pm-action"
      )
    if (Object.keys(plugin.manifest.connections ?? {}).length)
      this.button(
        mobileText("连接设置"),
        async () => {
          dialog.close()
          await this.options.open(id)
        },
        dialog,
        "pm-action"
      )
    const permissions = node("details", "pm-permissions")
    permissions.append(
      node("summary", "", mobileText("权限")),
      node("p", "", this.options.permissions(plugin.manifest))
    )
    dialog.append(permissions)
    this.button(
      mobileText("从设备卸载"),
      async () => {
        if (
          !(await this.options.confirm(
            `卸载 ${plugin.manifest.name}？资料不会被删除。`
          ))
        )
          return
        await this.options.native("uninstall", { id })
        dialog.close()
        await this.reload()
      },
      dialog,
      "pm-action pm-danger"
    )
  }
  private async settings(plugin: InstalledPlugin) {
    const dialog = this.sheet(`${plugin.manifest.name} 设置`)
    for (const [key, setting] of Object.entries(
      plugin.manifest.settings ?? {}
    )) {
      const value =
        (await this.options.native("settingGet", {
          id: plugin.manifest.id,
          key,
        })) ??
        setting.default ??
        ""
      if (!dialog.isConnected || this.disposed) return
      const label = node("label", "pm-setting", setting.title)
      const choices = "enum" in setting ? setting.enum : undefined
      const input = choices ? node("select") : node("input")
      if (input instanceof HTMLSelectElement)
        for (const option of choices ?? [])
          input.append(new Option(String(option), String(option)))
      if (input instanceof HTMLInputElement && setting.type === "boolean") {
        input.type = "checkbox"
        input.checked = Boolean(value)
      } else {
        input.value = String(value)
        if (input instanceof HTMLInputElement && setting.type === "number")
          input.type = "number"
      }
      input.onchange = () => {
        const next =
          input instanceof HTMLInputElement && input.type === "checkbox"
            ? input.checked
            : setting.type === "number"
              ? Number(input.value)
              : input.value
        input.disabled = true
        void Promise.resolve()
          .then(() => {
            validateSetting(setting, next)
            return this.options.native("settingSet", {
              id: plugin.manifest.id,
              key,
              value: next,
            })
          })
          .then(() => {
            this.status.textContent = mobileText("设置已保存")
          })
          .catch((error) => this.error(error))
          .finally(() => {
            input.disabled = false
          })
      }
      label.append(input)
      dialog.append(label)
    }
  }
}
