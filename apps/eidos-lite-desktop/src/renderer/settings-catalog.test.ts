import { describe, expect, it } from "vitest"
import {
  SETTINGS,
  searchSettings,
  settingsCatalog,
  type SettingDescriptor,
} from "./settings-catalog"
import { COMMAND_LABELS } from "./settings-shortcut-catalog"
import { EIDOS_LITE_SHORTCUT_COMMANDS } from "../shared/keyboard-shortcuts"
import { translateEidosLite } from "../shared/i18n"

const catalog = settingsCatalog({
  platform: "darwin",
  builtInPlugins: { terminal: false },
  fileEditorGroups: [],
})

describe("settings catalog", () => {
  it.each([
    ["深色", SETTINGS.appearance.id],
    ["ＤＡＲＫ", SETTINGS.appearance.id],
    ["UI SCALE", SETTINGS.uiScale.id],
    ["timezone", SETTINGS.timeZone.id],
    ["固定时区", SETTINGS.timeZone.id],
    ["周一", SETTINGS.weekStart.id],
    [".md", SETTINGS.markdownEditor.id],
    ["富文本", SETTINGS.markdownEditor.id],
    ["sandbox", SETTINGS.htmlEditor.id],
    ["sync password", SETTINGS.password.id],
    ["自定义服务器", SETTINGS.customServers.id],
    ["快速打开", "shortcuts.quick-open"],
    ["startup update", SETTINGS.startupUpdates.id],
  ])("finds %s in titles, descriptions and bilingual aliases", (query, id) => {
    expect(searchSettings(catalog, query)[0]?.id).toBe(id)
  })

  it("requires every distinct token and has stable ordering", () => {
    expect(
      searchSettings(catalog, "  sync   password password ").map(
        (item) => item.id
      )
    ).toEqual(searchSettings(catalog, "sync password").map((item) => item.id))
    expect(searchSettings(catalog, "theme password")).toEqual([])
    expect(searchSettings(catalog, " 　 ")).toEqual([])
    expect(searchSettings(catalog, "missing setting")).toEqual([])
    const descriptors: SettingDescriptor[] = [
      {
        ...SETTINGS.appearance,
        id: "summary",
        title: "Other",
        summary: "Theme",
        aliases: [],
      },
      {
        ...SETTINGS.appearance,
        id: "alias",
        title: "Another",
        summary: "",
        aliases: ["theme"],
      },
      SETTINGS.appearance,
    ]
    expect(searchSettings(descriptors, "theme").map((item) => item.id)).toEqual(
      [SETTINGS.appearance.id, "alias", "summary"]
    )
  })

  it("indexes only settings actually offered by this platform and enabled features", () => {
    expect(catalog.map((item) => item.id)).not.toContain(
      "shortcuts.toggle-terminal"
    )
    const available = settingsCatalog({
      platform: "unknown",
      builtInPlugins: { terminal: true },
      fileEditorGroups: [],
    })
    expect(available.map((item) => item.id)).toContain(
      "shortcuts.toggle-terminal"
    )
    expect(available.map((item) => item.id)).not.toContain(SETTINGS.password.id)
    expect(searchSettings(catalog, "sidecar")).toEqual([])
    expect(searchSettings(catalog, "terminal layout")).toEqual([])
  })

  it("gives every command one shared label and every static message a Chinese translation", () => {
    expect(Object.keys(COMMAND_LABELS).sort()).toEqual(
      [...EIDOS_LITE_SHORTCUT_COMMANDS].sort()
    )
    expect(new Set(catalog.map((item) => item.id)).size).toBe(catalog.length)
    for (const item of catalog) {
      for (const text of [item.title, item.summary].filter(Boolean)) {
        if (text === "Spark" || text === "Publish") continue
        expect(translateEidosLite("zh", text), text).not.toBe(text)
      }
    }
  })

  it("deduplicates grouped extensions while retaining a stable ID for each extension", () => {
    const dynamic = settingsCatalog({
      platform: "darwin",
      builtInPlugins: { terminal: false },
      fileEditorGroups: [
        {
          extensions: [".csv", ".tsv"],
          label: ".csv, .tsv",
          selected: "secret-preference-value",
          options: [
            { key: "secret-preference-value", label: "Private editor name" },
          ],
        },
      ],
    })
    expect(searchSettings(dynamic, "tsv")[0]?.id).toBe(
      "files.default-editor:.tsv"
    )
    expect(searchSettings(dynamic, ".csv, .tsv")).toHaveLength(1)
    expect(searchSettings(dynamic, "secret-preference-value")).toEqual([])
    expect(searchSettings(dynamic, "Private editor name")).toEqual([])
  })
})
