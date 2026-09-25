// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"

import type { EidosLiteApi } from "../shared/contracts"
import { DEFAULT_RENDERER_PREFERENCES } from "./app-appearance"
import { SettingsPage } from "./settings-page"

describe("SettingsPage Files - Default file editors", () => {
  it("renders default file editors section and updates plugin association", async () => {
    window.history.replaceState(null, "", "#/settings/files")
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

    const setPluginDefault = vi.fn(async () => {})
    const listPlugins = vi.fn(async () => ({
      plugins: [
        {
          manifest: {
            id: "csv-plugin",
            name: "CSV Tools",
            version: "1.0.0",
            placements: [
              {
                location: "file/open" as const,
                extensions: [".csv"],
                view: "glide",
              },
            ],
            views: [
              {
                id: "glide",
                title: "Glide Table",
                context: "document" as const,
                entry: "index.html",
              },
            ],
          },
          hash: "abc",
          enabled: true,
        },
      ],
      space: null,
      associations: { ".csv": "csv-plugin/glide" },
    }))

    Object.assign(window, {
      eidosLite: {
        getAppInfo: vi.fn(async () => ({
          name: "Eidos Lite",
          version: "0.2.2",
          platform: "darwin",
          architecture: "arm64",
          services: { name: "staging" },
        })),
        getPreferences: vi.fn(async () => DEFAULT_RENDERER_PREFERENCES),
        updatePreferences: vi.fn(async (patch) => ({
          ...DEFAULT_RENDERER_PREFERENCES,
          ...patch,
        })),
        onPreferencesChanged: vi.fn(() => () => {}),
        listTerminalShells: vi.fn(async () => []),
        getUpdateStatus: vi.fn(async () => ({
          state: "unavailable",
          currentVersion: "0.2.2",
        })),
        onUpdateStatusChanged: vi.fn(() => () => {}),
        listPlugins,
        setPluginDefault,
        onPluginEvent: vi.fn(() => () => {}),
      } as unknown as EidosLiteApi,
    })

    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(createElement(SettingsPage))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(host.textContent).toContain("Markdown file editor")
    expect(host.textContent).toContain("HTML default open mode")
    expect(host.textContent).toContain(".csv")
    expect(host.textContent).toContain(
      "Choose the default editor for .csv files."
    )

    const select = host.querySelector<HTMLSelectElement>(
      'select[aria-label=".csv"]'
    )
    expect(select).not.toBeNull()
    expect(select?.value).toBe("csv-plugin/glide")

    const options = [...(select?.querySelectorAll("option") ?? [])].map(
      (opt) => ({ value: opt.value, label: opt.textContent?.trim() })
    )
    expect(options).toEqual([
      { value: "builtin", label: "Built-in editor" },
      { value: "csv-plugin/glide", label: "Glide Table (CSV Tools)" },
    ])

    // Change to built-in editor
    await act(async () => {
      if (select) {
        select.value = "builtin"
        select.dispatchEvent(new Event("change", { bubbles: true }))
      }
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(setPluginDefault).toHaveBeenCalledWith(".csv", null)

    await act(async () => root.unmount())
    host.remove()
  })

  it("only renders Markdown and HTML when no plugins declare other file extensions", async () => {
    window.history.replaceState(null, "", "#/settings/files")
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

    const listPlugins = vi.fn(async () => ({
      plugins: [],
      space: {
        plugins: {},
        associations: {},
      },
    }))

    Object.assign(window, {
      eidosLite: {
        getAppInfo: vi.fn(async () => ({
          name: "Eidos Lite",
          version: "0.2.2",
          platform: "darwin",
          architecture: "arm64",
          services: { name: "staging" },
        })),
        getPreferences: vi.fn(async () => DEFAULT_RENDERER_PREFERENCES),
        updatePreferences: vi.fn(async () => DEFAULT_RENDERER_PREFERENCES),
        onPreferencesChanged: vi.fn(() => () => {}),
        listTerminalShells: vi.fn(async () => []),
        getUpdateStatus: vi.fn(async () => ({
          state: "unavailable",
          currentVersion: "0.2.2",
        })),
        onUpdateStatusChanged: vi.fn(() => () => {}),
        listPlugins,
        onPluginEvent: vi.fn(() => () => {}),
      } as unknown as EidosLiteApi,
    })

    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(createElement(SettingsPage))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(host.textContent).toContain("Markdown file editor")
    expect(host.textContent).toContain("HTML default open mode")
    expect(
      host.querySelectorAll('[aria-labelledby="settings-files"] select')
    ).toHaveLength(2)

    await act(async () => root.unmount())
    host.remove()
  })

  it("includes plugin choices in Markdown file editor when a plugin declares support for md files", async () => {
    window.history.replaceState(null, "", "#/settings/files")
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

    const setPluginDefault = vi.fn(async () => {})
    const updatePreferences = vi.fn(async (patch) => ({
      ...DEFAULT_RENDERER_PREFERENCES,
      ...patch,
    }))
    const listPlugins = vi.fn(async () => ({
      plugins: [
        {
          manifest: {
            id: "markmap-plugin",
            name: "Markmap",
            version: "1.0.0",
            placements: [
              {
                location: "file/open" as const,
                extensions: [".md", ".markdown"],
                view: "mindmap",
              },
            ],
            views: [
              {
                id: "mindmap",
                title: "Markmap View",
                context: "document" as const,
                entry: "index.html",
              },
            ],
          },
          hash: "def",
          enabled: true,
        },
      ],
      space: null,
      associations: {},
    }))

    Object.assign(window, {
      eidosLite: {
        getAppInfo: vi.fn(async () => ({
          name: "Eidos Lite",
          version: "0.2.2",
          platform: "darwin",
          architecture: "arm64",
          services: { name: "staging" },
        })),
        getPreferences: vi.fn(async () => DEFAULT_RENDERER_PREFERENCES),
        updatePreferences,
        onPreferencesChanged: vi.fn(() => () => {}),
        listTerminalShells: vi.fn(async () => []),
        getUpdateStatus: vi.fn(async () => ({
          state: "unavailable",
          currentVersion: "0.2.2",
        })),
        onUpdateStatusChanged: vi.fn(() => () => {}),
        listPlugins,
        setPluginDefault,
        onPluginEvent: vi.fn(() => () => {}),
      } as unknown as EidosLiteApi,
    })

    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(createElement(SettingsPage))
      await Promise.resolve()
      await Promise.resolve()
    })

    const mdSelect = host.querySelector<HTMLSelectElement>(
      "[data-markdown-file-editing-mode-select]"
    )
    expect(mdSelect).not.toBeNull()

    const optgroups = [...(mdSelect?.querySelectorAll("optgroup") ?? [])]
    expect(optgroups).toHaveLength(2)
    expect(optgroups[0].label).toBe("Built-in")
    expect(optgroups[1].label).toBe("Plugins")

    const pluginOption = optgroups[1].querySelector("option")
    expect(pluginOption?.value).toBe("markmap-plugin/mindmap")
    expect(pluginOption?.textContent?.trim()).toBe("Markmap View (Markmap)")

    // Select the plugin option
    await act(async () => {
      if (mdSelect) {
        mdSelect.value = "markmap-plugin/mindmap"
        mdSelect.dispatchEvent(new Event("change", { bubbles: true }))
      }
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(setPluginDefault).toHaveBeenCalledWith(
      ".md",
      "markmap-plugin/mindmap"
    )
    expect(setPluginDefault).toHaveBeenCalledWith(
      ".markdown",
      "markmap-plugin/mindmap"
    )

    // Switch back to Rich text
    await act(async () => {
      if (mdSelect) {
        mdSelect.value = "wysiwyg"
        mdSelect.dispatchEvent(new Event("change", { bubbles: true }))
      }
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(setPluginDefault).toHaveBeenCalledWith(".md", null)
    expect(setPluginDefault).toHaveBeenCalledWith(".markdown", null)
    expect(updatePreferences).toHaveBeenCalledWith({
      markdownFileEditingMode: "wysiwyg",
    })

    await act(async () => root.unmount())
    host.remove()
  })

  it("includes media views in default file editors when a plugin declares support for media files", async () => {
    window.history.replaceState(null, "", "#/settings/files")
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

    const setPluginDefault = vi.fn(async () => {})
    const listPlugins = vi.fn(async () => ({
      plugins: [
        {
          manifest: {
            id: "video-plugin",
            name: "Video Player",
            version: "1.0.0",
            placements: [
              {
                location: "file/open" as const,
                extensions: [".mp4", ".mov"],
                view: "player",
              },
            ],
            views: [
              {
                id: "player",
                title: "Subtitled Player",
                context: "media" as const,
                entry: "index.html",
              },
            ],
          },
          hash: "video-hash",
          enabled: true,
        },
      ],
      space: null,
      associations: { ".mp4": "video-plugin/player" },
    }))

    Object.assign(window, {
      eidosLite: {
        getAppInfo: vi.fn(async () => ({
          name: "Eidos Lite",
          version: "0.2.2",
          platform: "darwin",
          architecture: "arm64",
          services: { name: "staging" },
        })),
        getPreferences: vi.fn(async () => DEFAULT_RENDERER_PREFERENCES),
        updatePreferences: vi.fn(async (patch) => ({
          ...DEFAULT_RENDERER_PREFERENCES,
          ...patch,
        })),
        listPlugins,
        setPluginDefault,
        onPreferencesChanged: vi.fn(() => () => {}),
        listTerminalShells: vi.fn(async () => []),
        getUpdateStatus: vi.fn(async () => ({
          state: "unavailable",
          currentVersion: "0.2.2",
        })),
        onUpdateStatusChanged: vi.fn(() => () => {}),
        onPluginEvent: vi.fn(() => () => {}),
      } as unknown as EidosLiteApi,
    })

    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        createElement(SettingsPage, {
          onClose: () => {},
        })
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(host.textContent).toContain(".mp4")
    expect(host.textContent).toContain(".mov")
    expect(host.textContent).toContain("Subtitled Player")

    const select = host.querySelector(
      'select[aria-label=".mp4"]'
    ) as HTMLSelectElement
    expect(select).not.toBeNull()
    expect(select.value).toBe("video-plugin/player")

    await act(async () => root.unmount())
    host.remove()
  })
})
