// @vitest-environment jsdom
import { act, type ComponentProps } from "react"
import { createRoot } from "react-dom/client"
import fs from "node:fs/promises"
import path from "node:path"
import type { SpaceTreeEntry } from "../shared/contracts"
import {
  ExplorerEntryContextMenuItems,
  ExplorerRootContextMenuItems,
} from "./explorer-context-menu"
import { EidosLiteI18nProvider } from "./i18n"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const file = (
  name: string,
  kind: SpaceTreeEntry["kind"] = "file"
): SpaceTreeEntry => ({
  name,
  kind,
  relativePath: `docs/${name}`,
  size: 0,
  modifiedAtMs: 0,
})

async function setup(language = "en") {
  const originalApi = Object.getOwnPropertyDescriptor(window, "eidosLite")
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      getPreferences: async () => ({ language }),
      onPreferencesChanged: () => () => undefined,
      pluginEditors: async () => [],
      onPluginEvent: () => () => undefined,
    },
  })
  const host = document.createElement("div")
  host.setAttribute("role", "menu")
  document.body.append(host)
  const root = createRoot(host)
  const clipboard = {
    clipboard: null,
    canCapture: vi.fn(() => true),
    canPaste: vi.fn(() => true),
    capture: vi.fn().mockResolvedValue(undefined),
    paste: vi.fn().mockResolvedValue(undefined),
  }
  const actions = {
    open: vi.fn(),
    selectPluginEditor: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    showFolder: vi.fn(),
    manageFiles: vi.fn(),
    properties: vi.fn(),
    reveal: vi.fn(),
    copyPath: vi.fn(),
    trash: vi.fn(),
  }
  const close = vi.fn()
  const props: ComponentProps<typeof ExplorerEntryContextMenuItems> = {
    entry: file("note.md"),
    entries: [file("note.md")],
    platform: "darwin",
    macos: true,
    disabled: false,
    navigationDisabled: false,
    clipboard,
    selectedEditor: "builtin",
    editingModeShortcut: "⌘2",
    actions,
    onClose: close,
    publishAction: (
      <button type="button" role="menuitem">
        {language === "zh" ? "发布…" : "Publish…"}
      </button>
    ),
  }
  const render = async (next = props) => {
    await act(async () =>
      root.render(
        <EidosLiteI18nProvider>
          <ExplorerEntryContextMenuItems {...next} />
        </EidosLiteI18nProvider>
      )
    )
    await saveEvidence(
      `${language}-${next.platform}-${next.entry.name}-${next.entries.length}-${next.disabled}`
    )
  }
  const labels = () =>
    [
      ...host.querySelectorAll<HTMLElement>(
        '[role="menuitem"], [role="separator"]'
      ),
    ]
      .filter((node) => node.closest('[role="menu"]') === host)
      .map((node) => {
        if (node.getAttribute("role") === "separator") return "|"
        const label = node.cloneNode(true) as HTMLElement
        label
          .querySelectorAll(".space-context-menu-shortcut")
          .forEach((shortcut) => shortcut.remove())
        return label.textContent!.replace(/\s+/g, " ").trim()
      })
  const button = (label: string) =>
    [
      ...host.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'),
    ].find((node) =>
      node.textContent?.replace(/\s+/g, " ").trim().startsWith(label)
    )!
  const checkSeparators = () => {
    const sequence = labels()
    expect(sequence[0]).not.toBe("|")
    expect(sequence.at(-1)).not.toBe("|")
    expect(sequence.join(",")).not.toContain("|,|")
  }
  async function saveEvidence(name: string) {
    const directory = process.env.EIDOS_LITE_EXPLORER_MENU_TEST_EVIDENCE
    if (!directory) return
    if (!path.isAbsolute(directory))
      throw new Error("Menu evidence directory must be absolute")
    await fs.mkdir(directory, { recursive: true })
    const sequence = labels()
    const groups: string[][] = [[]]
    for (const label of sequence) {
      if (label === "|") groups.push([])
      else groups.at(-1)!.push(label)
    }
    await fs.writeFile(
      path.join(directory, `menu-${name}.json`),
      JSON.stringify(
        {
          language,
          sequence,
          groups,
          items: [
            ...host.querySelectorAll<HTMLButtonElement>(
              'button[role="menuitem"]'
            ),
          ].map((button) => ({
            text: button.textContent!.replace(/\s+/g, " ").trim(),
            disabled: button.disabled,
            shortcut:
              button.querySelector(".space-context-menu-shortcut")
                ?.textContent ?? null,
          })),
        },
        null,
        2
      ) + "\n"
    )
  }
  return {
    host,
    root,
    clipboard,
    actions,
    close,
    props,
    render,
    labels,
    button,
    checkSeparators,
    rootMenu: async (
      options: Partial<ComponentProps<typeof ExplorerRootContextMenuItems>> = {}
    ) => {
      const rootProps = {
        platform: "darwin",
        macos: true,
        disabled: false,
        navigationDisabled: false,
        clipboard,
        terminalOpen: false,
        onCreate: actions.create,
        onManageFiles: actions.manageFiles,
        onToggleTerminal: actions.open,
        onReveal: actions.reveal,
        onClose: close,
        ...options,
      }
      await act(async () =>
        root.render(
          <EidosLiteI18nProvider>
            <ExplorerRootContextMenuItems {...rootProps} />
          </EidosLiteI18nProvider>
        )
      )
      await saveEvidence(
        `${language}-${rootProps.platform}-root-${Boolean(rootProps.onToggleTerminal)}-${rootProps.clipboard.canPaste(null)}`
      )
    },
    cleanup: async () => {
      await act(async () => root.unmount())
      host.remove()
      if (originalApi) Object.defineProperty(window, "eidosLite", originalApi)
      else Reflect.deleteProperty(window, "eidosLite")
    },
  }
}

it("groups single-file open, editing, information, Publish and Trash without moving disabled items", async () => {
  const f = await setup()
  try {
    await f.render()
    const expected = [
      "Open",
      "Open with",
      "|",
      "Cut",
      "Copy",
      "Paste",
      "Rename",
      "|",
      "Reveal in Finder",
      "Copy Relative Path",
      "Copy Path",
      "File properties",
      "|",
      "Publish…",
      "|",
      "Move to Trash",
    ]
    expect(f.labels()).toEqual(expected)
    f.checkSeparators()
    await act(async () => f.button("Paste").click())
    expect(f.clipboard.paste).toHaveBeenCalledWith("docs")
    await act(async () => f.button("Copy Relative Path").click())
    expect(f.actions.copyPath).toHaveBeenCalledWith("relative")
    await act(async () => f.button("Rename").click())
    expect(f.actions.rename).toHaveBeenCalledOnce()
    expect(f.close).toHaveBeenCalledTimes(3)
    await f.render({ ...f.props, disabled: true, navigationDisabled: true })
    expect(f.labels()).toEqual(expected)
    for (const name of [
      "Open",
      "Open with",
      "Cut",
      "Copy",
      "Paste",
      "Rename",
      "File properties",
      "Move to Trash",
    ])
      expect(f.button(name).disabled).toBe(true)
  } finally {
    await f.cleanup()
  }
})

it.each(["darwin", "win32", "linux"])(
  "keeps eidos operations and platform shortcuts ordered on %s",
  async (platform) => {
    const f = await setup()
    try {
      const entry = file("tasks.eidos", "eidos")
      await f.render({
        ...f.props,
        entry,
        entries: [entry],
        platform,
        macos: platform === "darwin",
      })
      expect(f.labels().slice(0, 7)).toEqual([
        "Open",
        "|",
        "Cut",
        "Copy",
        "Paste",
        "Rename",
        "|",
      ])
      expect(
        f.button("Paste").querySelector(".space-context-menu-shortcut")!
          .textContent
      ).toBe(platform === "darwin" ? "⌘V" : "Ctrl+V")
      expect(f.labels().at(-1)).toBe("Move to Trash")
      f.checkSeparators()
    } finally {
      await f.cleanup()
    }
  }
)

it("organizes folder navigation, creation, editing and management and keeps folder Paste explicit", async () => {
  const f = await setup()
  try {
    const entry = file("folder", "directory")
    await f.render({
      ...f.props,
      entry,
      entries: [entry],
      publishAction: undefined,
      expansionActions: {
        scope: "folder",
        isExpanded: () => false,
        toggle: vi.fn(),
      },
    })
    expect(f.labels()).toEqual([
      "Show this folder",
      "Expand subfolders",
      "|",
      "New File",
      "New folder",
      "|",
      "Cut",
      "Copy",
      "Paste",
      "Rename",
      "|",
      "Reveal in Finder",
      "Copy Relative Path",
      "Copy Path",
      "Manage files",
      "|",
      "Move to Trash",
    ])
    f.checkSeparators()
    await act(async () => f.button("New File").click())
    expect(f.actions.create).toHaveBeenCalledWith("create-file")
    await act(async () => f.button("Paste").click())
    expect(f.clipboard.paste).toHaveBeenCalledWith("docs/folder")
    await act(async () => f.button("Manage files").click())
    expect(f.actions.manageFiles).toHaveBeenCalledOnce()
  } finally {
    await f.cleanup()
  }
})

it("keeps only applicable multi-selection operations with a count, expansion and last Trash group", async () => {
  const f = await setup()
  try {
    const entries = [file("a.txt"), file("folder", "directory")]
    await f.render({
      ...f.props,
      entries,
      expansionActions: {
        scope: "folder",
        isExpanded: () => true,
        toggle: vi.fn(),
      },
    })
    expect(
      f.host.querySelector(".space-context-menu-selection")!.textContent
    ).toBe("2 items selected")
    expect(f.labels()).toEqual([
      "Cut",
      "Copy",
      "Paste",
      "|",
      "Collapse subfolders",
      "|",
      "Move to Trash",
    ])
    await act(async () => f.button("Cut").click())
    expect(f.clipboard.capture).toHaveBeenCalledWith("cut", entries)
    f.checkSeparators()
  } finally {
    await f.cleanup()
  }
})

it("offers useful root creation and utilities when Paste is unavailable and routes root Paste to null", async () => {
  const f = await setup()
  try {
    f.clipboard.canPaste.mockReturnValue(false)
    await f.rootMenu()
    expect(f.labels()).toEqual([
      "New File",
      "New folder",
      "|",
      "Paste",
      "|",
      "Manage files",
      "Show terminal",
      "Reveal in Finder",
    ])
    expect(f.button("Paste").disabled).toBe(true)
    expect(f.button("New File").disabled).toBe(false)
    f.checkSeparators()
    for (const name of [
      "New File",
      "New folder",
      "Manage files",
      "Show terminal",
      "Reveal in Finder",
    ])
      await act(async () => f.button(name).click())
    expect(f.actions.create.mock.calls).toEqual([
      ["create-file"],
      ["create-folder"],
    ])
    expect(f.actions.manageFiles).toHaveBeenCalledOnce()
    expect(f.actions.open).toHaveBeenCalledOnce()
    expect(f.actions.reveal).toHaveBeenCalledOnce()
    f.clipboard.canPaste.mockReturnValue(true)
    await f.rootMenu({ onToggleTerminal: undefined })
    await act(async () => f.button("Paste").click())
    expect(f.clipboard.canPaste).toHaveBeenLastCalledWith(null)
    expect(f.clipboard.paste).toHaveBeenCalledWith(null)
    expect(f.labels()).not.toContain("Show terminal")
    f.checkSeparators()
  } finally {
    await f.cleanup()
  }
})

it("preserves the same Chinese groups and shortcut labels", async () => {
  const f = await setup("zh")
  try {
    await f.render()
    expect(f.labels().slice(0, 7)).toEqual([
      "打开",
      "打开方式",
      "|",
      "剪切",
      "复制",
      "粘贴",
      "重命名",
    ])
    expect(f.labels().indexOf("文件属性")).toBeGreaterThan(
      f.labels().indexOf("重命名")
    )
    expect(f.labels().at(-1)).toBe("移到废纸篓")
    expect(f.button("粘贴").textContent).toContain("⌘V")
    f.checkSeparators()
    await f.rootMenu({ terminalOpen: true })
    expect(f.labels()).toEqual([
      "新建文件",
      "新建文件夹",
      "|",
      "粘贴",
      "|",
      "管理文件",
      "隐藏终端",
      "在访达中显示",
    ])
    f.checkSeparators()
  } finally {
    await f.cleanup()
  }
})
