import { mobileText } from "./locale"
import { EidosRuntimeEditorDataSource } from "@eidos.space/eidos-file-ui"
import { HttpRuntimeClient } from "../../eidos-file-serve/src/client"
import {
  MobilePluginInstance,
  type NativeRequest,
  type Program,
  type TableBinding,
} from "./host"
import { validatePackage } from "./validate"
import { validateSetting } from "../../plugin-runtime/src/manifest"
import type {
  PluginManifest,
  ViewDeclaration,
  TableActionItem,
} from "../../plugin-runtime/src/contracts"
import "./style.css"
import { showPluginReadme } from "./readme"

type PluginLaunch = {
  id: string
  path?: string
  view: string
  mode?: "tools" | "readme"
}

declare global {
  interface Window {
    EidosMobile?: { postMessage(message: string): void }
    eidosMobileStart(token: string, dark: boolean, launch?: PluginLaunch): void
    eidosMobileReply(
      id: string,
      response: { value?: unknown; error?: string }
    ): void
    eidosMobileIOS?: { postMessage(message: unknown): Promise<unknown> }
    eidosMobileBoot?: { token: string; dark: boolean; launch?: PluginLaunch }
    eidosMobileValidate?: (raw: string) => void
  }
}
const root = document.getElementById("app")!
window.eidosMobileValidate = (raw) => {
  validatePackage(raw)
}
const pending = new Map<
  string,
  {
    resolve(value: unknown): void
    reject(error: Error): void
    timer: ReturnType<typeof setTimeout>
  }
>()
window.eidosMobileReply = (id, response) => {
  const call = pending.get(id)
  if (!call) return
  pending.delete(id)
  clearTimeout(call.timer)
  if (response.error) call.reject(new Error(response.error))
  else call.resolve(response.value)
}
let started = false
window.eidosMobileStart = (token, dark, launch) => {
  if (started) return
  started = true
  window.dispatchEvent(new Event("eidos-mobile-started"))
  document.documentElement.dataset.theme = dark ? "dark" : "light"
  const native: NativeRequest = <T>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<T> => {
    if (window.eidosMobileIOS)
      return window.eidosMobileIOS.postMessage({ method, params }) as Promise<T>
    return new Promise<T>((resolve, reject) => {
      const id = crypto.randomUUID()
      pending.set(id, {
        resolve: (value) => resolve(value as never),
        reject,
        timer: setTimeout(() => {
          pending.delete(id)
          reject(new Error(mobileText("宿主请求超时")))
        }, 60000),
      })
      window.EidosMobile?.postMessage(
        JSON.stringify({ token, id, method, params })
      )
    })
  }
  const workbench = new Workbench(native)
  void (
    launch
      ? launch.mode === "readme"
        ? showPluginReadme(root, native, launch.id)
        : launch.mode === "tools"
          ? workbench.open(launch.id)
          : launch.path === undefined
            ? workbench.openPage(launch)
            : workbench.openFile(launch)
      : workbench.home()
  ).catch((error) => {
    root.textContent = mobileText("插件启动失败：") + errorText(error)
  })
}
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "") => {
  const node = document.createElement(tag)
  node.textContent = text
  return node
}
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error)
export function confirmation(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = element("dialog"),
      paragraph = element("p", message),
      controls = element("footer")
    const finish = (answer: boolean) => {
      dialog.close()
      dialog.remove()
      resolve(answer)
    }
    for (const [text, answer] of [
      [mobileText("取消"), false],
      [mobileText("允许"), true],
    ] as const) {
      const button = element("button", text)
      button.onclick = () => finish(answer)
      controls.append(button)
    }
    dialog.append(paragraph, controls)
    document.body.append(dialog)
    dialog.oncancel = (event) => {
      event.preventDefault()
      finish(false)
    }
    dialog.showModal()
  })
}
type FileInfo = { path: string; kind: string }
class Workbench {
  private instances: MobilePluginInstance[] = []
  private notice = element("p")
  private generation = 0
  constructor(readonly native: NativeRequest) {
    this.notice.setAttribute("role", "status")
  }
  private clear(title: string) {
    root.classList.remove("file-view", "plugin-manager")
    this.generation++
    for (const instance of this.instances) instance.dispose()
    this.instances = []
    root.replaceChildren(element("h1", title), this.notice)
    this.notice.textContent = ""
  }
  private button(
    text: string,
    action: () => unknown,
    parent: HTMLElement = root
  ) {
    const button = element("button", text)
    button.onclick = () => {
      button.disabled = true
      void Promise.resolve()
        .then(action)
        .catch((error) => {
          this.notice.textContent = errorText(error)
        })
        .finally(() => {
          button.disabled = false
        })
    }
    parent.append(button)
    return button
  }
  async home() {
    await this.native("manager.open")
  }
  private async load(id: string) {
    const program = await this.native<Program>("package", { id })
    validatePackage(JSON.stringify({ format: 2, ...program }))
    return program
  }
  async openFile(launch: PluginLaunch) {
    if (launch.path === undefined) throw new Error(mobileText("文件路径缺失"))
    this.clear("")
    root.querySelector("h1")?.remove()
    root.classList.add("file-view")
    this.notice.textContent = mobileText("正在打开…")
    const program = await this.load(launch.id)
    const view = program.manifest.views?.find(
      (v) => v.id === launch.view && v.kind === "file"
    )
    const placement = program.manifest.placements?.find(
      (p) => p.location === "file/open" && p.view === launch.view
    )
    if (
      !view ||
      placement?.location !== "file/open" ||
      !placement.extensions.some((e) => launch.path!.toLowerCase().endsWith(e))
    )
      throw new Error(mobileText("此插件不支持当前文件"))
    const mount = element("main")
    mount.className = "plugin-surface"
    root.append(mount)
    const timeout = setTimeout(() => {
      this.notice.textContent = mobileText("插件暂未完成加载，请返回后重试。")
    }, 15000)
    const instance = new MobilePluginInstance(program, this.native, {
      path: launch.path,
      view,
      ready: () => {
        clearTimeout(timeout)
        this.notice.textContent = ""
      },
      notify: (message) => {
        clearTimeout(timeout)
        this.notice.textContent = message
      },
      openFile: (path) => this.native("openFile", { path }),
      navigate: () => {
        throw new Error(mobileText("请从插件页面打开此功能"))
      },
      confirm: confirmation,
      theme: {
        "--eidos-color-scheme":
          document.documentElement.dataset.theme ?? "light",
      },
    })
    this.instances.push(instance)
    mount.append(instance.frame)
  }
  async openPage(launch: PluginLaunch) {
    this.clear("")
    root.querySelector("h1")?.remove()
    root.classList.add("file-view")
    this.notice.textContent = mobileText("正在打开…")
    const program = await this.load(launch.id)
    if (
      !program.manifest.placements?.some(
        (p) => p.location === "navigation" && p.view === launch.view
      )
    )
      throw new Error(mobileText("此页面未声明导航入口"))
    const mount = element("main")
    mount.className = "plugin-surface"
    root.append(mount)
    const navigate = (id: string, route?: string) => {
      const view = program.manifest.views?.find(
        (v) => v.id === id && v.kind === "page"
      )
      if (!view) throw new Error(mobileText("页面不存在"))
      for (const previous of this.instances) previous.dispose()
      this.instances = []
      const instance = new MobilePluginInstance(program, this.native, {
        view,
        route,
        ready: () => {
          this.notice.textContent = ""
        },
        notify: (message) => {
          this.notice.textContent = message
        },
        navigate,
        openFile: (path) => this.native("openFile", { path }),
        confirm: confirmation,
        theme: {
          "--eidos-color-scheme":
            document.documentElement.dataset.theme ?? "light",
        },
      })
      this.instances.push(instance)
      mount.replaceChildren(instance.frame)
    }
    navigate(launch.view)
  }
  async open(id: string, actionId?: string) {
    this.clear(mobileText("插件"))
    this.button(mobileText("返回我的插件"), () => this.native("manager.open"))
    const program = await this.load(id),
      manifest = program.manifest
    root.querySelector("h1")!.textContent = manifest.name
    const generation = this.generation
    const controls = element("section"),
      mount = element("main")
    mount.className = "plugin-surface"
    root.append(controls, mount)
    const needsFile =
      manifest.views?.some((v) => v.kind === "file") ||
      manifest.actions?.some((a) => a.context === "table")
    const files = needsFile
      ? await this.native<FileInfo[]>("files", {
          path: "",
          recursive: true,
        })
      : []
    const file = element("select")
    file.setAttribute("aria-label", mobileText("选择文件"))
    file.append(new Option(mobileText("选择文件"), ""))
    for (const f of files.filter((f) => f.kind === "file"))
      file.append(new Option(f.path, f.path))
    controls.append(file)
    file.hidden = !needsFile
    let table: TableBinding | undefined
    const tables = element("select")
    tables.setAttribute("aria-label", mobileText("选择数据表"))
    controls.append(tables)
    tables.hidden = !needsFile
    let selection = 0
    const disposeSelection = () => {
      for (const instance of this.instances) instance.dispose()
      this.instances = []
      mount.replaceChildren()
    }
    file.onchange = () => {
      void (async () => {
        const currentSelection = ++selection
        disposeSelection()
        table = undefined
        tables.replaceChildren()
        if (/\.eidos$/i.test(file.value)) {
          const path = file.value
          const source = new EidosRuntimeEditorDataSource(
            new HttpRuntimeClient((method, request) =>
              this.native("runtime", { path, method, request })
            ),
            path
          )
          const snapshot = await source.initialize()
          if (selection !== currentSelection || generation !== this.generation)
            return
          for (const t of snapshot.tables)
            tables.append(new Option(t.table.name, t.table.id))
          const selectTable = () => {
            disposeSelection()
            const t = snapshot.tables.find((t) => t.table.id === tables.value)
            table = t
              ? {
                  source: source!,
                  table: t,
                  view: t.views[0] ?? {
                    id: "",
                    name: "",
                    type: "grid",
                    tableId: t.table.id,
                    properties: {},
                  },
                  query: {},
                }
              : undefined
          }
          tables.onchange = selectTable
          selectTable()
        }
      })().catch((error) => (this.notice.textContent = errorText(error)))
    }
    const theme = () => {
      const style = getComputedStyle(document.documentElement)
      return Object.fromEntries(
        [
          ["--eidos-background", "--theme-surface"],
          ["--eidos-foreground", "--theme-ink"],
          ["--eidos-primary", "--theme-accent"],
        ].map(([key, value]) => [key, style.getPropertyValue(value)])
      )
    }
    const create = (
      view?: ViewDeclaration,
      extension = false,
      ready?: () => void,
      route?: string
    ) => {
      if (generation !== this.generation)
        throw new Error(mobileText("页面已关闭"))
      const instance = new MobilePluginInstance(program, this.native, {
        path: file.value || undefined,
        table,
        view,
        extension,
        route,
        theme: theme(),
        notify: (message) => (this.notice.textContent = message),
        navigate: (viewId, route) => {
          const next = manifest.views!.find((v) => v.id === viewId)!
          const page = create(next, false, undefined, route)
          mount.replaceChildren(page.frame)
        },
        openFile: (path) => this.native("openFile", { path }),
        openRecord: async (rowId) => {
          if (!table) return
          const row = await table.source.getRow?.(table.table.table.id, rowId)
          if (!row) throw new Error(mobileText("记录不存在"))
          const dialog = element("dialog")
          for (const field of table.table.fields)
            dialog.append(
              element(
                "p",
                field.name + "：" + String(row[field.tableColumnName] ?? "")
              )
            )
          this.button(
            mobileText("关闭"),
            () => {
              dialog.close()
              dialog.remove()
            },
            dialog
          )
          document.body.append(dialog)
          dialog.showModal()
        },
        ready,
        confirm: confirmation,
      })
      this.instances.push(instance)
      return instance
    }
    for (const view of manifest.views ?? [])
      this.button(
        view.title,
        async () => {
          if (view.kind === "file") {
            if (!file.value) throw new Error(mobileText("请先选择文件"))
            const placements =
              manifest.placements?.filter(
                (p) => "view" in p && p.view === view.id
              ) ?? []
            const opener = placements.find((p) => p.location === "file/open")
            if (
              opener?.location === "file/open" &&
              !opener.extensions.some((e) =>
                file.value.toLowerCase().endsWith(e)
              )
            )
              throw new Error(mobileText("此视图不支持所选文件"))
            if (
              view.capabilities?.some((c) => c.startsWith("eidos/")) &&
              !table
            )
              throw new Error(mobileText("请选择 Eidos 文件和数据表"))
            if (placements.some((p) => p.location === "table/view") && table) {
              const type = "plugin:" + manifest.id + "/" + view.id
              const snapshot = await table.source.getSnapshot()
              const existing = snapshot.tables
                .find((t) => t.table.id === table!.table.table.id)
                ?.views.find((v) => v.type === type)
              if (existing) table = { ...table, view: existing }
              else {
                const result = await table.source.createView(
                  table.table.table.id,
                  { name: view.title, type, properties: {} }
                )
                table = {
                  ...table,
                  view: result.tables
                    .find((t) => t.table.id === table!.table.table.id)!
                    .views.find((v) => v.type === type)!,
                }
              }
              if (table.view.queryStatus === "unsupported")
                throw new Error(mobileText("此视图查询暂不受支持"))
              table.query = {
                filter: table.view.filter,
                sorts: table.view.sorts,
              }
            }
          }
          for (const instance of this.instances) instance.dispose()
          this.instances = []
          const instance = create(view)
          mount.replaceChildren()
          if (view.configuration && table) {
            const bound = table
            const settings = element("details")
            settings.append(element("summary", mobileText("视图设置")))
            for (const [key, property] of Object.entries(
              view.configuration.properties
            )) {
              const label = element("label", property.title)
              const fields = "x-field" in property && property["x-field"]
              const choices = "enum" in property ? property.enum : undefined
              const input =
                fields || choices ? element("select") : element("input")
              input.setAttribute("aria-label", property.title)
              if (input instanceof HTMLSelectElement) {
                if (fields) {
                  input.append(new Option(mobileText("选择字段"), ""))
                  for (const field of bound.table.fields)
                    input.append(new Option(field.name, field.id))
                } else
                  for (const value of choices ?? [])
                    input.append(new Option(String(value), String(value)))
              }
              const current =
                (
                  bound.view.properties?.plugin as
                    | Record<string, unknown>
                    | undefined
                )?.[key] ?? property.default
              if (
                input instanceof HTMLInputElement &&
                property.type === "boolean"
              ) {
                input.type = "checkbox"
                input.checked = Boolean(current)
              } else input.value = String(current ?? "")
              input.onchange = () => {
                const controls = [
                  ...settings.querySelectorAll<
                    HTMLInputElement | HTMLSelectElement
                  >("input,select"),
                ]
                for (const control of controls) control.disabled = true
                const value =
                  input instanceof HTMLInputElement && input.type === "checkbox"
                    ? input.checked
                    : property.type === "number"
                      ? Number(input.value)
                      : input.value
                void (async () => {
                  const values = {
                    ...((bound.view.properties?.plugin ?? {}) as Record<
                      string,
                      unknown
                    >),
                    [key]: value,
                  }
                  await bound.source.updateView(bound.view.id, {
                    properties: { ...bound.view.properties, plugin: values },
                  })
                  bound.view = {
                    ...bound.view,
                    properties: { ...bound.view.properties, plugin: values },
                  }
                  instance.refresh()
                })()
                  .catch(
                    (error) => (this.notice.textContent = errorText(error))
                  )
                  .finally(() => {
                    for (const control of controls) control.disabled = false
                  })
              }
              label.append(input)
              settings.append(label)
            }
            mount.append(settings)
          }
          mount.append(instance.frame)
        },
        controls
      )
    let requestedAction: HTMLButtonElement | undefined
    for (const action of manifest.actions ?? []) {
      const actionButton = this.button(
        action.title,
        async () => {
          if (action.context === "table" && !table)
            throw new Error(mobileText("请选择 Eidos 文件和数据表"))
          let resolveReady!: () => void
          const ready = new Promise<void>((resolve) => {
            resolveReady = resolve
          })
          const instance = create(undefined, true, resolveReady)
          controls.append(instance.frame)
          await Promise.race([
            ready,
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error(mobileText("插件启动超时"))),
                10000
              )
            ),
          ])
          if (action.context === "table") {
            const items = (await instance.action(
              action.id,
              "list"
            )) as TableActionItem[]
            if (!Array.isArray(items) || items.length > 100)
              throw new Error(mobileText("无效动作列表"))
            const choices = element("section")
            mount.append(choices)
            if (!items.length)
              choices.append(
                element("p", mobileText("暂无可执行动作，请先打开插件配置。"))
              )
            for (const item of items)
              if (item.targets?.includes("view"))
                this.button(
                  item.title,
                  async () => {
                    await instance.action(action.id, "run", item.id)
                    this.notice.textContent = mobileText("动作已完成")
                  },
                  choices
                )
          } else {
            try {
              await instance.action(action.id)
            } finally {
              instance.dispose()
              this.instances = this.instances.filter(
                (value) => value !== instance
              )
            }
          }
        },
        controls
      )
      if (action.id === actionId) requestedAction = actionButton
    }
    if (actionId && !requestedAction)
      throw new Error(mobileText("插件功能不存在"))
    requestedAction?.click()
    for (const [key, setting] of Object.entries(manifest.settings ?? {})) {
      const choices = "enum" in setting ? setting.enum : undefined
      const label = element("label", setting.title),
        input = choices ? element("select") : element("input")
      input.setAttribute("aria-label", setting.title)
      if (input instanceof HTMLSelectElement)
        for (const value of choices ?? [])
          input.append(new Option(String(value), String(value)))
      input.value = String(
        (await this.native("settingGet", { id, key })) ?? setting.default ?? ""
      )
      if (input instanceof HTMLInputElement && setting.type === "boolean") {
        input.type = "checkbox"
        input.checked = input.value === "true"
      }
      input.onchange = () => {
        const value =
          setting.type === "boolean" && input instanceof HTMLInputElement
            ? input.checked
            : setting.type === "number"
              ? Number(input.value)
              : input.value
        try {
          validateSetting(setting, value)
          void this.native("settingSet", { id, key, value }).catch(
            (error) => (this.notice.textContent = errorText(error))
          )
        } catch (error) {
          this.notice.textContent = errorText(error)
        }
      }
      label.append(input)
      controls.append(label)
    }
    for (const [connection, declaration] of Object.entries(
      manifest.connections ?? {}
    )) {
      const label = element("label", declaration.title),
        url = element("input"),
        key = element("input")
      url.value = declaration.url
      url.disabled = !declaration.configurable
      url.type = "url"
      url.setAttribute("aria-label", declaration.title + " URL")
      key.type = "password"
      key.autocomplete = "off"
      key.placeholder = mobileText("API Key（仅保存在本机）")
      label.append(url, key)
      this.button(
        mobileText("保存连接"),
        async () => {
          await this.native("connectionSave", {
            id,
            connection,
            url: url.value,
            token: key.value,
          })
          key.value = ""
          this.notice.textContent = mobileText("连接已保存")
        },
        label
      )
      controls.append(label)
    }
  }
}

if (window.eidosMobileBoot) {
  const { token, dark, launch } = window.eidosMobileBoot
  delete window.eidosMobileBoot
  window.eidosMobileStart(token, dark, launch)
}
window.dispatchEvent(new Event("eidos-mobile-ready"))
