import type { EidosLiteBuiltInPlugins } from "../shared/built-in-plugins"
import { translateEidosLite, type EidosLiteMessageValues } from "../shared/i18n"
import type { EidosLiteShortcutCommand } from "../shared/keyboard-shortcuts"
import { supportsEncryptedSync } from "../shared/sync-encryption"
import type { FileEditorGroup } from "./settings-file-editors"
import {
  COMMAND_LABELS,
  enabledShortcutGroups,
} from "./settings-shortcut-catalog"

export const SETTINGS_SECTIONS = [
  { id: "preferences", label: "Preferences" },
  { id: "devices", label: "Devices" },
  { id: "account-sync", label: "Account & Services" },
  { id: "files", label: "Files" },
  { id: "shortcuts", label: "Keyboard Shortcuts" },
  { id: "updates", label: "Updates" },
  { id: "about", label: "About" },
] as const

export type SettingsPageId = (typeof SETTINGS_SECTIONS)[number]["id"]

export interface SettingDescriptor {
  readonly id: string
  readonly pageId: SettingsPageId
  readonly title: string
  readonly searchTitle?: string
  readonly summary: string
  readonly aliases: readonly string[]
  readonly target: "control" | "section"
  readonly group?: string
  readonly values?: EidosLiteMessageValues
  /** Multiple extension descriptors can point to one original editor row. */
  readonly resultGroup?: string
}

function setting<Id extends string>(
  id: Id,
  pageId: SettingsPageId,
  title: string,
  summary: string,
  aliases: readonly string[],
  target: SettingDescriptor["target"] = "control"
) {
  return { id, pageId, title, summary, aliases, target } as const
}

/** Static text only. Preference values and account/Space identities never enter search. */
export const SETTINGS = {
  uiScale: setting(
    "preferences.ui-scale",
    "preferences",
    "UI scale",
    "Resize the entire interface. Saved for all windows.",
    ["zoom", "scale", "缩放", "界面大小"]
  ),
  appearance: setting(
    "preferences.appearance",
    "preferences",
    "Theme",
    "Follow the system or keep one appearance.",
    ["appearance", "dark", "light", "外观", "深色", "浅色"]
  ),
  language: setting(
    "preferences.language",
    "preferences",
    "Language",
    "Use the system language or choose one for Eidos Lite.",
    ["locale", "english", "chinese", "中文", "英文"]
  ),
  timeZone: setting(
    "preferences.time-zone",
    "preferences",
    "Time zone",
    "Follow the system time zone or choose a fixed zone for date and time displays.",
    ["timezone", "时区"]
  ),
  recordSystemFields: setting(
    "preferences.record-system-fields",
    "preferences",
    "Always hide system fields in records",
    "Hide Record ID, Created, and Updated in all open records on this device.",
    [
      "record",
      "properties",
      "system fields",
      "记录",
      "属性",
      "系统字段",
      "隐藏",
    ]
  ),
  weekStart: setting(
    "preferences.week-start",
    "preferences",
    "Start week on Monday",
    "Show Monday as the first day in Calendar views.",
    ["week start", "周一", "星期一", "周起始"]
  ),
  spaceLocation: setting(
    "preferences.default-space-location",
    "preferences",
    "Default location for new Spaces",
    "Choose where new Spaces are created.",
    ["folder", "directory", "storage", "默认位置", "目录"]
  ),
  markdownEditor: setting(
    "files.markdown-editor",
    "files",
    "Markdown file editor",
    "Choose the default editor for .md and .markdown files.",
    [".md", ".markdown", "rich text", "source", "富文本", "源码"]
  ),
  htmlEditor: setting(
    "files.html-open-mode",
    "files",
    "HTML default open mode",
    "Choose how .html and .htm files open. Preview runs in a sandbox.",
    [".html", ".htm", "preview", "source", "预览", "源码", "默认打开"]
  ),
  lan: setting(
    "devices.lan-sync",
    "devices",
    "LAN sync",
    "Connect your devices on the same local network. Pair once to reach the Spaces this computer shares. No cloud account needed.",
    ["局域网", "本地同步"]
  ),
  pairing: setting(
    "devices.pairing",
    "devices",
    "Connect a new device",
    "Scan the code on your phone, then approve it here.",
    ["pair", "qr code", "phone", "tablet", "配对", "二维码", "手机", "平板"]
  ),
  pairedDevices: setting(
    "devices.paired-devices",
    "devices",
    "Paired devices",
    "Manage devices paired with this computer.",
    ["remove access", "设备管理", "移除访问"],
    "section"
  ),
  sharedSpaces: setting(
    "devices.shared-spaces",
    "devices",
    "Spaces shared over LAN",
    "Choose which Spaces to share in their Sync panels. Turning off LAN sync here stops sharing for all Spaces.",
    ["共享空间", "局域网共享"],
    "section"
  ),
  account: setting(
    "account.identity",
    "account-sync",
    "Eidos account",
    "Sign in to use Eidos Sync and Publish.",
    ["login", "sign in", "sign out", "账户", "账号", "登录", "退出"],
    "section"
  ),
  spark: setting(
    "account.spark",
    "account-sync",
    "Spark",
    "Advanced Spark features are available on this device.",
    ["license", "activate", "许可证", "激活"],
    "section"
  ),
  sync: setting(
    "sync.access",
    "account-sync",
    "Sync",
    "Manage Sync",
    ["cloud", "access", "quota", "云同步", "配额"],
    "section"
  ),
  automaticSync: setting(
    "sync.automatic",
    "account-sync",
    "Automatic Sync",
    "Sync saved changes in open, connected Spaces when Eidos Lite is idle. Includes custom servers.",
    ["interval", "after changes", "自动同步", "同步间隔"]
  ),
  password: setting(
    "sync.password",
    "account-sync",
    "Sync password",
    "Use the same sync password on your other devices.",
    ["encryption", "secure storage", "加密", "同步密码", "安全存储"]
  ),
  customServers: setting(
    "sync.custom-servers",
    "account-sync",
    "Custom servers",
    "Saved on this computer. Choose a server for each Space in Sync. Custom servers require Spark.",
    ["graft", "server", "token", "自定义服务器", "访问密钥"],
    "section"
  ),
  publish: setting(
    "publish.account",
    "account-sync",
    "Publish",
    "Sign in to manage Publish.",
    ["published pages", "storage", "发布", "发布存储"],
    "section"
  ),
  restoreShortcuts: setting(
    "shortcuts.restore-defaults",
    "shortcuts",
    "Restore all defaults",
    "Keyboard Shortcuts",
    ["reset shortcuts", "重置快捷键"]
  ),
  currentVersion: setting(
    "updates.current-version",
    "updates",
    "Current version",
    "What's new",
    ["version", "release notes", "版本", "更新日志"],
    "section"
  ),
  startupUpdates: setting(
    "updates.startup-check",
    "updates",
    "Check for updates on startup",
    "Check when Eidos Lite starts. Updates download only when you choose.",
    ["startup update", "自动更新", "启动更新"]
  ),
  softwareUpdate: setting(
    "updates.software",
    "updates",
    "Software update",
    "Check for updates",
    [
      "download update",
      "restart to update",
      "软件更新",
      "下载更新",
      "重启更新",
    ],
    "section"
  ),
  documentation: setting("about.documentation", "about", "Documentation", "", [
    "help",
    "docs",
    "帮助",
    "文档",
  ]),
  website: setting("about.website", "about", "Eidos website", "", ["官网"]),
  source: setting("about.source", "about", "Source code on GitHub", "", [
    "open source",
    "开源",
    "源代码",
  ]),
  diagnostics: setting("about.diagnostics", "about", "Copy diagnostics", "", [
    "debug",
    "诊断",
    "调试",
  ]),
  logs: setting("about.logs", "about", "Show logs folder", "", ["log", "日志"]),
} as const

export type SettingId =
  | (typeof SETTINGS)[keyof typeof SETTINGS]["id"]
  | `shortcuts.${EidosLiteShortcutCommand}`
  | `files.default-editor:${string}`

/** Apply to the original surface; creates no extra card or form. */
export function settingTarget(id: SettingId) {
  return { "data-setting-id": id, tabIndex: -1 } as const
}

export function settingsCatalog(context: {
  platform: string
  builtInPlugins: EidosLiteBuiltInPlugins
  fileEditorGroups: readonly FileEditorGroup[]
}): SettingDescriptor[] {
  const descriptors: SettingDescriptor[] = Object.values(SETTINGS).filter(
    (item) =>
      item.id !== SETTINGS.password.id ||
      supportsEncryptedSync(context.platform)
  )
  for (const group of enabledShortcutGroups(context.builtInPlugins)) {
    for (const command of group.commands) {
      descriptors.push({
        id: "shortcuts." + command,
        pageId: "shortcuts",
        title: COMMAND_LABELS[command],
        summary: "Keyboard Shortcuts",
        aliases: ["key binding", "快捷键"],
        group: group.label,
        target: "control",
      })
    }
  }
  for (const group of context.fileEditorGroups) {
    for (const extension of group.extensions) {
      descriptors.push({
        id: "files.default-editor:" + extension,
        pageId: "files",
        title: group.label,
        searchTitle: extension,
        summary: "Choose the default editor for {extensions} files.",
        values: { extensions: group.label },
        aliases: [
          group.label,
          extension,
          extension.slice(1),
          "default editor",
          "默认编辑器",
        ],
        target: "control",
        resultGroup: group.extensions.join(" "),
      })
    }
  }
  return descriptors
}

export function normalizeSettingsQuery(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ")
}

/** Deterministic bilingual matching. No I/O, DOM text, user values, or action callbacks. */
export function searchSettings(
  descriptors: readonly SettingDescriptor[],
  query: string
): SettingDescriptor[] {
  const normalized = normalizeSettingsQuery(query)
  if (!normalized) return []
  const tokens = [...new Set(normalized.split(" "))]
  const matches = descriptors.flatMap((descriptor, order) => {
    const category = SETTINGS_SECTIONS.find(
      (section) => section.id === descriptor.pageId
    )!.label
    const fields = (["en", "zh"] as const).flatMap((locale) => [
      normalizeSettingsQuery(
        translateEidosLite(
          locale,
          descriptor.searchTitle ?? descriptor.title,
          descriptor.values
        )
      ),
    ])
    const aliases = descriptor.aliases.map(normalizeSettingsQuery)
    const summaries = (["en", "zh"] as const).map((locale) =>
      normalizeSettingsQuery(
        translateEidosLite(locale, descriptor.summary, descriptor.values)
      )
    )
    const paths = (["en", "zh"] as const).map((locale) =>
      normalizeSettingsQuery(
        translateEidosLite(locale, category) +
          " " +
          translateEidosLite(locale, descriptor.group ?? "")
      )
    )
    const ranks = tokens.map((token) => {
      if (fields.some((text) => text === token)) return 0
      if (fields.some((text) => text.startsWith(token))) return 1
      if (fields.some((text) => text.includes(token))) return 2
      if (aliases.some((text) => text.includes(token))) return 3
      if (summaries.some((text) => text.includes(token))) return 4
      if (paths.some((text) => text.includes(token))) return 5
      return -1
    })
    if (ranks.includes(-1)) return []
    const score = fields.includes(normalized)
      ? -1
      : Math.max(...ranks) * 100 +
        ranks.reduce<number>((a, b) => a + b, 0) / ranks.length
    return [{ descriptor, score, order }]
  })
  matches.sort((a, b) => a.score - b.score || a.order - b.order)
  const seen = new Set<string>()
  return matches.flatMap(({ descriptor }) => {
    const key = descriptor.resultGroup ?? descriptor.id
    if (seen.has(key)) return []
    seen.add(key)
    return [descriptor]
  })
}
