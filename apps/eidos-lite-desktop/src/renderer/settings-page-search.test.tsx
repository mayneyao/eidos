// @vitest-environment jsdom
import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import type { EidosLiteApi, EidosLitePreferences } from "../shared/contracts"
import type { PluginListing, SpaceFileEditorSettings } from "../shared/plugins"
import { DEFAULT_RENDERER_PREFERENCES } from "./app-appearance"
import { EidosLiteI18nProvider } from "./i18n"
import { SettingsPage } from "./settings-page"
import {
  SETTINGS,
  SETTINGS_SECTIONS,
  settingsCatalog,
} from "./settings-catalog"
import { fileEditorSettings } from "./settings-file-editors"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function pluginListing(): PluginListing {
  return {
    associations: {},
    space: null,
    plugins: [
      {
        hash: "synthetic",
        enabled: false,
        manifest: {
          apiVersion: 1,
          id: "example.csv",
          name: "CSV editor",
          version: "1.0.0",
          views: [
            {
              id: "csv",
              title: "CSV editor",
              kind: "file",
              capabilities: ["document"],
              entry: "view.html",
            },
          ],
          placements: [
            {
              location: "file/open",
              extensions: [".csv", ".tsv"],
              view: "csv",
            },
          ],
        },
      },
    ],
  }
}

describe("Settings search through original controls", () => {
  let host: HTMLDivElement
  let root: Root
  let saved: EidosLitePreferences
  let listing: PluginListing
  const listeners = new Set<(preferences: EidosLitePreferences) => void>()
  const fileContextListeners = new Set<() => void>()
  const navigationListeners = new Set<(page: "files") => void>()
  const createApi = () => ({
    getAppInfo: vi.fn(async () => ({
      name: "Eidos Lite",
      version: "synthetic-private-version",
      platform: "darwin",
      architecture: "arm64",
      services: { name: "staging" },
    })),
    getPreferences: vi.fn(async () => saved),
    updatePreferences: vi.fn(async (patch: Partial<EidosLitePreferences>) => {
      saved = { ...saved, ...patch }
      listeners.forEach((listener) => listener(saved))
      return saved
    }),
    onPreferencesChanged: (
      listener: (preferences: EidosLitePreferences) => void
    ) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getUpdateStatus: vi.fn(async () => ({
      state: "unavailable",
      currentVersion: "synthetic-private-version",
    })),
    onUpdateStatusChanged: () => () => {},
    getAccountStatus: vi.fn(async () => ({ state: "signed-out" })),
    onAccountChanged: () => () => {},
    getSyncStatus: vi.fn(),
    getPublishAccountStatus: vi.fn(),
    getSyncPasswordSettings: vi.fn(async () => ({
      available: true,
      configured: true,
    })),
    saveDefaultSyncPassword: vi.fn(
      async (_input: { password: Uint8Array }) => {}
    ),
    listPlugins: vi.fn(async () => listing),
    getSpaceFileEditorSettings: vi.fn<
      () => Promise<SpaceFileEditorSettings | null>
    >(async () => null),
    setSpaceFileEditorDefault: vi.fn<EidosLiteApi["setSpaceFileEditorDefault"]>(
      async () => {}
    ),
    onSettingsSpaceFileEditorsChanged: (listener: () => void) => {
      fileContextListeners.add(listener)
      return () => {
        fileContextListeners.delete(listener)
      }
    },
    onSettingsNavigate: (listener: (page: "files") => void) => {
      navigationListeners.add(listener)
      return () => {
        navigationListeners.delete(listener)
      }
    },
    setPluginDefault: vi.fn(
      async (extension: string, editor: string | null) => {
        if (editor === null) delete listing.associations?.[extension]
        else
          listing.associations = {
            ...listing.associations,
            [extension]: editor,
          }
      }
    ),
    onPluginEvent: () => () => {},
    listCustomSyncServers: vi.fn(async () => []),
    getSparkStatus: vi.fn(async () => ({ state: "inactive", licenses: [] })),
    peerSync: vi.fn(async () => ({ running: false, devices: [], spaces: [] })),
    checkForUpdates: vi.fn(),
    copyDiagnostics: vi.fn(),
    openSettingsDestination: vi.fn(),
  })
  let api: ReturnType<typeof createApi>
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    window.history.replaceState(null, "", "#/settings/preferences")
    window.localStorage.clear()
    listeners.clear()
    fileContextListeners.clear()
    navigationListeners.clear()
    saved = {
      ...DEFAULT_RENDERER_PREFERENCES,
      language: "en",
      builtInPlugins: { terminal: false },
    }
    listing = pluginListing()
    api = createApi()
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: api as unknown as EidosLiteApi,
    })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  const mount = () =>
    act(async () =>
      root.render(
        <EidosLiteI18nProvider>
          <SettingsPage />
        </EidosLiteI18nProvider>
      )
    )
  const input = () => host.querySelector<HTMLInputElement>('[role="combobox"]')!
  const content = () => host.querySelector<HTMLElement>(".settings-content")!
  const fill = (field: HTMLInputElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(field, value)
      field.dispatchEvent(new Event("input", { bubbles: true }))
    })
  const search = async (query: string) => {
    await act(async () => input().focus())
    await fill(input(), query)
  }
  const key = async (
    name: string,
    options: KeyboardEventInit = {},
    target: HTMLElement = input()
  ) => {
    const event = new KeyboardEvent("keydown", {
      key: name,
      bubbles: true,
      cancelable: true,
      ...options,
    })
    await act(async () => target.dispatchEvent(event))
    return event
  }
  const button = (label: string, owner: ParentNode = host) =>
    Array.from(owner.querySelectorAll<HTMLButtonElement>("button")).find(
      (item) => item.textContent?.trim() === label
    )!
  const page = async (label: string) =>
    act(async () => button(label, host.querySelector("nav")!).click())

  const select = (label: string) =>
    host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!
  const choose = (control: HTMLSelectElement, value: string) =>
    act(async () => {
      control.value = value
      control.dispatchEvent(new Event("change", { bubbles: true }))
    })

  it.each([
    [
      "en",
      "Choose how each file type opens by default for ",
      ".",
      "This device (global)",
    ],
    ["zh", "为", "设置各类文件的默认打开方式。", "本设备（全局）"],
    [
      "ja",
      "",
      "で、ファイル形式ごとの既定の開き方を設定します。",
      "このデバイス（全体）",
    ],
    [
      "ko",
      "",
      "에서 파일 형식별 기본 열기 방식을 설정합니다.",
      "이 기기(전역)",
    ],
    [
      "pt-BR",
      "Defina o modo padrão de abrir cada tipo de arquivo para ",
      ".",
      "Este dispositivo (global)",
    ],
  ] as const)(
    "places the scope control in the localized %s sentence",
    async (language, prefix, suffix, device) => {
      saved.language = language
      window.history.replaceState(null, "", "#/settings/files")
      await mount()
      const scope = host.querySelector<HTMLSelectElement>(
        ".settings-file-editor-scope select"
      )!
      expect(scope).not.toBeNull()
      expect(scope.previousSibling?.textContent ?? "").toBe(prefix)
      expect(scope.nextSibling?.textContent).toBe(suffix)
      expect(scope.selectedOptions[0].textContent).toBe(device)
      expect(scope.value).toBe("device")
      expect(scope.disabled).toBe(true)
    }
  )

  it("waits for Space before deep-linking and changes only the selected scope", async () => {
    window.history.replaceState(null, "", "#/settings/files")
    const initial = deferred<SpaceFileEditorSettings>()
    const drawing = { key: "example.csv/csv", label: "CSV editor" }
    const snapshot: SpaceFileEditorSettings = {
      contextId: "workbench-a",
      spaceName: "Project Space",
      focusExtension: ".csv",
      extensions: [
        {
          extension: ".csv",
          override: drawing.key,
          deviceEditor: drawing.label,
          editors: [drawing],
        },
        {
          extension: ".tsv",
          override: "example.old/view",
          deviceEditor: null,
          editors: [drawing],
        },
      ],
    }
    api.getSpaceFileEditorSettings
      .mockReturnValueOnce(initial.promise)
      .mockImplementation(async () => snapshot)
    api.setSpaceFileEditorDefault.mockImplementation(
      async (contextId, extension, editor) => {
        expect(contextId).toBe(snapshot.contextId)
        const setting = snapshot.extensions.find(
          (row) => row.extension === extension
        )!
        setting.override = editor
      }
    )
    await mount()
    expect(select("Scope").value).toBe("pending")
    expect(select("Markdown file editor")).toBeNull()
    expect(select(".csv, .tsv")).toBeNull()

    await act(async () => initial.resolve(snapshot))
    expect(select("Scope").value).toBe("space")
    expect(select("Scope").selectedOptions[0].textContent).toBe(
      "Space: Project Space"
    )
    expect(select("Scope").title).toBe("Space: Project Space")
    expect(select("Scope").closest("[data-default-file-editors]")).toBeNull()
    expect(document.activeElement).toBe(select(".csv"))
    expect(select(".csv").selectedOptions[0].textContent).toBe("CSV editor")
    expect(select(".tsv").selectedOptions[0].textContent).toBe(
      "Built-in editor (plugin unavailable)"
    )
    expect(host.querySelectorAll("[data-default-file-editors]")).toHaveLength(1)
    expect(select(".csv, .tsv")).toBeNull()
    expect(api.setSpaceFileEditorDefault).not.toHaveBeenCalled()

    select("Scope").focus()
    expect(document.activeElement).toBe(select("Scope"))
    await choose(select("Scope"), "device")
    expect(select("Scope").selectedOptions[0].textContent).toBe(
      "This device (global)"
    )
    expect(document.activeElement).toBe(select("Scope"))
    expect(select(".csv")).toBeNull()
    expect(select("Markdown file editor")).not.toBeNull()
    await choose(select(".csv, .tsv"), drawing.key)
    expect(api.setPluginDefault.mock.calls).toEqual([
      [".csv", drawing.key],
      [".tsv", drawing.key],
    ])
    expect(api.setSpaceFileEditorDefault).not.toHaveBeenCalled()

    await choose(select("Scope"), "space")
    await choose(select(".csv"), "device")
    expect(api.setSpaceFileEditorDefault).toHaveBeenCalledExactlyOnceWith(
      "workbench-a",
      ".csv",
      null
    )
    expect(select(".csv").selectedOptions[0].textContent).toBe(
      "Follow device (CSV editor)"
    )
    expect(select(".tsv").value).toBe("example.old/view")
    expect(api.setPluginDefault).toHaveBeenCalledTimes(2)
    await search(".tsv")
    await key("Enter")
    expect(document.activeElement).toBe(select(".tsv"))
  })

  it("attaches reused Settings to the newest workbench and restores device rows after a read failure", async () => {
    const old = deferred<SpaceFileEditorSettings>()
    const current = deferred<SpaceFileEditorSettings>()
    await mount()
    await page("Files")
    expect(select("Scope").value).toBe("device")
    expect(select("Markdown file editor")).not.toBeNull()

    const navigateFromPlugin = async () =>
      act(async () => {
        fileContextListeners.forEach((listener) => listener())
        navigationListeners.forEach((listener) => listener("files"))
      })
    api.getSpaceFileEditorSettings.mockReturnValueOnce(old.promise)
    await navigateFromPlugin()
    expect(select("Scope").value).toBe("pending")
    expect(select("Markdown file editor")).toBeNull()

    api.getSpaceFileEditorSettings.mockReturnValueOnce(current.promise)
    await navigateFromPlugin()
    const snapshot: SpaceFileEditorSettings = {
      contextId: "workbench-b",
      spaceName: "New Space",
      focusExtension: ".tsv",
      extensions: [
        { extension: ".tsv", override: null, deviceEditor: null, editors: [] },
      ],
    }
    await act(async () => current.resolve(snapshot))
    await act(async () =>
      old.resolve({
        ...snapshot,
        contextId: "workbench-a",
        spaceName: "Old Space",
      })
    )
    expect(select("Scope").selectedOptions[0].textContent).toBe(
      "Space: New Space"
    )
    expect(document.activeElement).toBe(select(".tsv"))

    api.getSpaceFileEditorSettings.mockRejectedValueOnce(
      new Error("Cannot read file defaults")
    )
    await navigateFromPlugin()
    expect(select("Scope").value).toBe("device")
    expect(select("Markdown file editor")).not.toBeNull()
    expect(host.textContent).toContain("Cannot read file defaults")
    expect(api.setSpaceFileEditorDefault).not.toHaveBeenCalled()
  })

  it("searches without mounting inactive modules, writing preferences, reloading pages or changing scroll", async () => {
    await mount()
    const original = content()
    original.scrollTop = 137
    for (const query of [
      "theme",
      "token",
      "pair",
      "update",
      "synthetic-private-version",
      " ",
    ])
      await search(query)
    expect(content()).toBe(original)
    expect(content().scrollTop).toBe(137)
    expect(window.location.hash).toBe("#/settings/preferences")
    expect(api.listPlugins).toHaveBeenCalledTimes(1)
    for (const method of [
      api.getSyncStatus,
      api.getPublishAccountStatus,
      api.getSparkStatus,
      api.listCustomSyncServers,
      api.peerSync,
      api.updatePreferences,
      api.checkForUpdates,
    ]) {
      expect(method).not.toHaveBeenCalled()
    }
    await search("synthetic-private-version")
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(0)
    expect(host.textContent).toContain("No matching settings")
    await key("Escape")
    expect(input().value).toBe("")
    expect(document.activeElement).toBe(input())
    expect(content().scrollTop).toBe(137)
  })

  it.each(["en", "zh"] as const)(
    "finds and saves the original record default switch in %s",
    async (language) => {
      saved.language = language
      await mount()
      const selector =
        '[data-setting-id="preferences.record-system-fields"] [role="switch"]'
      const original = host.querySelector<HTMLButtonElement>(selector)!
      expect(original).not.toBeNull()
      await search(language === "zh" ? "系统字段" : "system fields")
      await key("Enter")
      expect(document.activeElement).toBe(original)
      expect(api.updatePreferences).not.toHaveBeenCalled()
      await act(async () => original.click())
      expect(api.updatePreferences).toHaveBeenCalledWith({
        hideSystemFieldsInRecords: true,
      })
      expect(original.getAttribute("aria-checked")).toBe("true")
      await act(async () => root.unmount())
      root = createRoot(host)
      await mount()
      expect(host.querySelector(selector)?.getAttribute("aria-checked")).toBe(
        "true"
      )
    }
  )

  it("focuses the existing Files select, saves through its handler and reads back on reopening", async () => {
    await mount()
    const original = host.querySelector<HTMLSelectElement>(
      "[data-markdown-file-editing-mode-select]"
    )!
    await search(".md")
    await key("Enter")
    expect(window.location.hash).toBe("#/settings/files")
    expect(host.querySelector(".settings-titlebar h1")?.textContent).toBe(
      "Files"
    )
    expect(document.activeElement).toBe(original)
    expect(host.querySelector("[data-markdown-file-editing-mode-select]")).toBe(
      original
    )
    expect(api.updatePreferences).not.toHaveBeenCalled()
    await act(async () => {
      original.value = "source"
      original.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(api.updatePreferences).toHaveBeenCalledWith({
      markdownFileEditingMode: "source",
    })
    expect(api.setPluginDefault).toHaveBeenCalledWith(".md", null)
    expect(api.listPlugins).toHaveBeenCalledTimes(2)
    await act(async () => root.unmount())
    root = createRoot(host)
    await mount()
    expect(
      host.querySelector<HTMLSelectElement>(
        "[data-markdown-file-editing-mode-select]"
      )?.value
    ).toBe("source")
  })

  it("finds unvisited grouped file extensions and navigates to their one real control", async () => {
    await mount()
    await search("tsv")
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(1)
    await key("Enter")
    const select = host.querySelector<HTMLSelectElement>(
      '[data-setting-ids~="files.default-editor:.tsv"] select'
    )!
    expect(document.activeElement).toBe(select)
    await act(async () => {
      select.value = "example.csv/csv"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(api.setPluginDefault).toHaveBeenCalledWith(".csv", "example.csv/csv")
    expect(api.setPluginDefault).toHaveBeenCalledWith(".tsv", "example.csv/csv")
    expect(api.updatePreferences).not.toHaveBeenCalled()
  })

  it("keeps server draft nodes, secret inputs and errors across result navigation", async () => {
    await mount()
    await search("custom server")
    await key("Enter")
    await act(async () => button("Add server").click())
    const fields = host.querySelectorAll<HTMLInputElement>(
      "[data-settings-custom-servers] input"
    )
    expect(fields).toHaveLength(3)
    await fill(fields[0]!, "synthetic draft name")
    await fill(fields[1]!, "https://synthetic.invalid")
    await fill(fields[2]!, "synthetic private token")
    await search("theme")
    await key("Enter")
    await search("custom server")
    await key("Enter")
    expect(host.querySelector("[data-settings-custom-servers] input")).toBe(
      fields[0]
    )
    expect(Array.from(fields).map((field) => field.value)).toEqual([
      "synthetic draft name",
      "https://synthetic.invalid",
      "synthetic private token",
    ])
    expect(api.listCustomSyncServers).toHaveBeenCalledTimes(1)
    await search("synthetic private token")
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(0)
    expect(
      (await key("f", { metaKey: true }, fields[0]!)).defaultPrevented
    ).toBe(false)
  })

  it("does not reclaim focus after a password save completes in the background", async () => {
    const pending = deferred<void>()
    api.saveDefaultSyncPassword.mockImplementation(() => pending.promise)
    await mount()
    await search("sync password")
    await key("Enter")
    await act(async () => button("Change for new Spaces").click())
    const fields = host.querySelectorAll<HTMLInputElement>(
      ".sync-password-settings input"
    )
    await fill(fields[0]!, "synthetic password")
    await fill(fields[1]!, "synthetic password")
    await act(async () =>
      host
        .querySelector(".sync-password-settings form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    )
    expect(api.saveDefaultSyncPassword).toHaveBeenCalledTimes(1)
    await search("theme")
    await key("Enter")
    const destination = document.activeElement
    await act(async () => pending.resolve(undefined))
    expect(document.activeElement).toBe(destination)
    expect(host.querySelector(".sync-password-settings input")).toBeNull()
    expect(host.textContent).toContain("Sync password saved for new Spaces.")
  })

  it("retains a save failure while browsing search and other categories", async () => {
    api.updatePreferences.mockRejectedValueOnce(
      new Error("synthetic save failure")
    )
    await mount()
    const select = host.querySelector<HTMLSelectElement>(
      'select[aria-label="UI scale"]'
    )!
    await act(async () => {
      select.value = "1.25"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await search("markdown")
    await key("Enter")
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "synthetic save failure"
    )
    await page("Preferences")
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "synthetic save failure"
    )
  })

  it("does not restore a password trigger after the Settings window loses focus", async () => {
    const pending = deferred<void>()
    api.saveDefaultSyncPassword.mockImplementation(() => pending.promise)
    await mount()
    await search("sync password")
    await key("Enter")
    await act(async () => button("Change for new Spaces").click())
    const fields = host.querySelectorAll<HTMLInputElement>(
      ".sync-password-settings input"
    )
    await fill(fields[0]!, "synthetic password")
    await fill(fields[1]!, "synthetic password")
    await act(async () =>
      host
        .querySelector(".sync-password-settings form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    )
    await act(async () => window.dispatchEvent(new Event("blur")))
    await act(async () => pending.resolve(undefined))
    expect(document.activeElement).not.toBe(button("Change for new Spaces"))
  })

  it("guards IME confirmation, supports result keys and leaves ordinary editing shortcuts alone", async () => {
    await mount()
    await act(async () => {
      input().focus()
      input().dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true })
      )
    })
    await fill(input(), ".md")
    await key("Enter", { isComposing: true })
    await key("Enter", { keyCode: 229 })
    expect(
      (await key("f", { metaKey: true, keyCode: 229 })).defaultPrevented
    ).toBe(false)
    expect(window.location.hash).toBe("#/settings/preferences")
    await act(async () =>
      input().dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true })
      )
    )
    await key("Enter")
    expect(window.location.hash).toBe("#/settings/preferences")
    await act(async () =>
      input().dispatchEvent(
        new KeyboardEvent("keyup", { key: "Enter", bubbles: true })
      )
    )
    await key("Enter")
    expect(window.location.hash).toBe("#/settings/files")
    await search("sync")
    const first = input().getAttribute("aria-activedescendant")
    await key("ArrowDown")
    expect(input().getAttribute("aria-activedescendant")).not.toBe(first)
    await key("ArrowUp")
    expect(input().getAttribute("aria-activedescendant")).toBe(first)
    for (const name of ["a", "c", "v", "x", "z", "ArrowLeft", "Home", "End"])
      expect(
        (await key(name, { metaKey: name.length === 1 })).defaultPrevented
      ).toBe(false)
    expect((await key("Tab")).defaultPrevented).toBe(false)
    await act(async () =>
      button("Preferences", host.querySelector("nav")!).focus()
    )
    expect(input().getAttribute("aria-expanded")).toBe("false")
    await key("Escape")
    expect(input().value).toBe("")
    const nav = button("Preferences", host.querySelector("nav")!)
    await act(async () => nav.focus())
    expect((await key("f", { metaKey: true }, nav)).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(input())
  })

  it("opens a shortcut's original recorder without recording, and lets recording own its keys", async () => {
    await mount()
    await search("quick open")
    await key("Enter")
    const recorder = host.querySelector<HTMLButtonElement>(
      '[data-setting-id="shortcuts.quick-open"] [data-setting-focus]'
    )!
    expect(document.activeElement).toBe(recorder)
    expect(recorder.dataset.recording).toBe("false")
    expect(api.updatePreferences).not.toHaveBeenCalled()
    await act(async () => recorder.click())
    await key("f", { metaKey: true }, recorder)
    expect(document.activeElement).not.toBe(input())
  })

  it("preserves the query, original controls and search focus through a language change", async () => {
    await mount()
    await search("theme")
    const original = host.querySelector(
      '[data-setting-id="preferences.appearance"]'
    )
    await act(async () => {
      await api.updatePreferences({ language: "zh" })
    })
    expect(input().value).toBe("theme")
    expect(document.activeElement).toBe(input())
    expect(host.querySelector('[role="option"] strong')?.textContent).toBe(
      "主题"
    )
    expect(
      host.querySelector('[data-setting-id="preferences.appearance"]')
    ).toBe(original)
    expect(api.listPlugins).toHaveBeenCalledTimes(2)
  })

  it("resolves every registered setting to one original target after visiting its category", async () => {
    await mount()
    for (const section of SETTINGS_SECTIONS) await page(section.label)
    const descriptors = settingsCatalog({
      platform: "darwin",
      builtInPlugins: saved.builtInPlugins,
      fileEditorGroups: fileEditorSettings(listing, (text) => text)
        .fileEditorGroups,
    })
    for (const descriptor of descriptors) {
      expect(
        host.querySelectorAll(
          '[data-setting-id="' +
            descriptor.id +
            '"], [data-setting-ids~="' +
            descriptor.id +
            '"]'
        ),
        descriptor.id
      ).toHaveLength(1)
    }
    await search("copy diagnostics")
    await key("Enter")
    expect(document.activeElement).toBe(button("Copy diagnostics"))
    expect(api.copyDiagnostics).not.toHaveBeenCalled()
  })

  it("pauses device polling while hidden without remounting the visited page", async () => {
    vi.useFakeTimers()
    await mount()
    expect(api.peerSync).not.toHaveBeenCalled()
    await page("Devices")
    const original = host.querySelector("#settings-devices")
    await act(async () => vi.advanceTimersByTimeAsync(2100))
    expect(api.peerSync).toHaveBeenCalledTimes(2)
    await page("Preferences")
    await act(async () => vi.advanceTimersByTimeAsync(6000))
    expect(api.peerSync).toHaveBeenCalledTimes(2)
    await page("Devices")
    expect(host.querySelector("#settings-devices")).toBe(original)
    expect(api.peerSync).toHaveBeenCalledTimes(3)
  })

  it("focuses a disabled setting's original explanation without activating its action", async () => {
    await mount()
    await search("restore all defaults")
    await key("Enter")
    const row = host.querySelector<HTMLElement>(
      '[data-setting-id="shortcuts.restore-defaults"]'
    )!
    expect(row.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true)
    expect(document.activeElement).toBe(row)
    expect(api.updatePreferences).not.toHaveBeenCalled()
  })

  it("scrolls only on explicit navigation and restores category positions across history events", async () => {
    await mount()
    content().scrollTop = 137
    const row = host.querySelector<HTMLElement>(
      '[data-setting-id="files.markdown-editor"]'
    )!
    vi.spyOn(content(), "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 400, 300)
    )
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 600, 380, 70)
    )
    await search(".md")
    expect(content().scrollTop).toBe(137)
    await key("Enter")
    const filesScroll = content().scrollTop
    expect(filesScroll).toBeGreaterThan(137)
    await page("Preferences")
    expect(content().scrollTop).toBe(137)
    await act(async () => {
      window.history.replaceState(null, "", "#/settings/files")
      window.dispatchEvent(new PopStateEvent("popstate"))
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    })
    expect(content().scrollTop).toBe(filesScroll)
    await act(async () => {
      button("About", host.querySelector("nav")!).click()
      button("Preferences", host.querySelector("nav")!).click()
    })
    expect(content().scrollTop).toBe(137)
    await page("Files")
    expect(content().scrollTop).toBe(filesScroll)
  })

  it("shares a cold directory request during StrictMode effect replay", async () => {
    const pending = deferred<PluginListing>()
    api.listPlugins.mockImplementationOnce(() => pending.promise)
    await act(async () =>
      root.render(
        <StrictMode>
          <EidosLiteI18nProvider>
            <SettingsPage />
          </EidosLiteI18nProvider>
        </StrictMode>
      )
    )
    expect(api.listPlugins).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve(listing))
    expect(api.listPlugins).toHaveBeenCalledTimes(1)
    await search(".tsv")
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(1)
  })

  it("uses the first system language when Chromium selects a different locale", async () => {
    saved.language = "system"
    vi.spyOn(window.navigator, "languages", "get").mockReturnValue([
      "ja",
      "fr-FR",
      "ja-JP",
    ])
    Object.assign(api, { systemLocale: "fr-FR" })
    await mount()
    expect(document.documentElement.lang).toBe("en")
    expect(content().textContent).toContain("Language")

    const appInfo = await api.getAppInfo()
    api.getAppInfo.mockImplementation(async () => ({
      ...appInfo,
      systemLocale: "pt-PT",
    }))
    await act(async () => window.dispatchEvent(new Event("languagechange")))
    expect(document.documentElement.lang).toBe("pt-BR")
  })

  it("coalesces invalidations during a directory read and never navigates on a late response", async () => {
    const pending = deferred<PluginListing>()
    api.listPlugins.mockImplementationOnce(() => pending.promise)
    await mount()
    await search(".csv")
    await act(async () => {
      window.dispatchEvent(new Event("eidos-plugins-changed"))
      window.dispatchEvent(new Event("eidos-plugins-changed"))
    })
    expect(api.listPlugins).toHaveBeenCalledTimes(1)
    const old = listing
    listing = { plugins: [], space: null, associations: {} }
    await act(async () => pending.resolve(old))
    expect(api.listPlugins).toHaveBeenCalledTimes(2)
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(0)
    expect(window.location.hash).toBe("#/settings/preferences")
    expect(document.activeElement).toBe(input())
  })

  it("shows directory progress and failures without blocking static results, and retries explicitly", async () => {
    const pending = deferred<PluginListing>()
    api.listPlugins.mockImplementationOnce(() => pending.promise)
    await mount()
    await search(".csv")
    expect(host.textContent).toContain("Reading file editor settings…")
    expect(window.location.hash).toBe("#/settings/preferences")
    await act(async () =>
      pending.reject(new Error("synthetic catalog failure"))
    )
    expect(host.textContent).toContain("File editor settings are unavailable.")
    await search("theme")
    expect(host.querySelector('[role="option"] strong')?.textContent).toBe(
      "Theme"
    )
    await act(async () =>
      button("Retry", host.querySelector(".settings-search")!).click()
    )
    await search(".csv")
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(1)
    listing = { plugins: [], space: null, associations: {} }
    await act(async () =>
      window.dispatchEvent(new Event("eidos-plugins-changed"))
    )
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(0)
    await key("Enter")
    expect(window.location.hash).toBe("#/settings/preferences")
    expect(api.listPlugins).toHaveBeenCalledTimes(3)
  })

  it("does not advertise a platform-dependent control before its availability is known", async () => {
    const pending = deferred<Awaited<ReturnType<typeof api.getAppInfo>>>()
    api.getAppInfo.mockImplementationOnce(() => pending.promise)
    await mount()
    await search("sync password")
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(0)
    expect(api.getSyncPasswordSettings).not.toHaveBeenCalled()
    await act(async () =>
      pending.resolve({
        name: "Eidos Lite",
        version: "synthetic",
        platform: "darwin",
        architecture: "arm64",
        services: { name: "staging" },
      })
    )
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(1)
    expect(document.activeElement).toBe(input())
    await key("Enter")
    expect(document.activeElement).toBe(button("Change for new Spaces"))
  })
})
