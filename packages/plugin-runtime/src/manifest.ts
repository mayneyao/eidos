import type {
  PluginManifest,
  ResourceDeclaration,
  SettingDeclaration,
  SettingValue,
} from "./contracts"
import { invalid, PluginError } from "./errors"
import { parseThemeStylesheet, themeStylesheetPath } from "./theme-stylesheet"

const localId = /^[a-z][a-z0-9-]*$/
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("Expected an object")
  return value as Record<string, unknown>
}
function fields(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = []
) {
  if (
    required.some((k) => !Object.hasOwn(value, k)) ||
    Object.keys(value).some((k) => ![...required, ...optional].includes(k))
  )
    invalid("Unknown or missing fields")
}
function text(value: unknown, max = 128): asserts value is string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    invalid("Invalid label")
}
function id(value: unknown): asserts value is string {
  text(value)
  if (!localId.test(value)) invalid("Invalid local ID")
}
function strings(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((v) => typeof v !== "string") ||
    new Set(value).size !== value.length
  )
    invalid("Expected nonempty unique strings")
  return value as string[]
}
export function entryPath(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !value.startsWith("./") ||
    !/\.(tsx?|jsx?)$/.test(value) ||
    /[\\?#\u0000-\u001f]/.test(value) ||
    value
      .slice(2)
      .split("/")
      .some((p) => !p || p === "." || p === ".." || p.includes(":"))
  )
    invalid("Invalid source entry")
}
function iconFilePath(value: unknown): asserts value is string {
  if (typeof value !== "string" || /[\\?#\u0000-\u001f]/.test(value)) {
    invalid("Invalid icon path")
  }
  if (value.startsWith("data:")) {
    if (
      !/^data:image\/(svg\+xml|png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(
        value
      ) ||
      value.length > 512 * 1024
    ) {
      invalid("Invalid icon data URL")
    }
    return
  }
  if (
    !/\.(svg|png|jpe?g|webp|gif)$/i.test(value) ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    (value.startsWith("./") ? value.slice(2) : value)
      .split("/")
      .some((p) => !p || p === "." || p === ".." || p.includes(":"))
  ) {
    invalid("Invalid icon path")
  }
}
function extensions(value: unknown) {
  if (
    strings(value).some((v) => !/^\.[a-z0-9]{1,16}$/.test(v) || v === ".eidos")
  )
    invalid("Invalid text extension")
}
function collection(value: unknown): Record<string, unknown>[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) invalid("Expected declaration array")
  const result = value.map(record)
  const ids = new Set<string>()
  for (const item of result) {
    id(item.id)
    if (ids.has(item.id)) invalid("Duplicate contribution ID")
    ids.add(item.id)
  }
  return result
}
export function validateSetting(
  declaration: SettingDeclaration,
  value: unknown
): asserts value is SettingValue {
  if (typeof value !== declaration.type) invalid("Setting type mismatch")
  if (
    declaration.type === "string" &&
    (typeof value !== "string" ||
      new TextEncoder().encode(value).length > 4096 ||
      (declaration.enum && !declaration.enum.includes(value)))
  )
    invalid("Invalid string setting")
  if (
    declaration.type === "number" &&
    (typeof value !== "number" ||
      !Number.isFinite(value) ||
      (declaration.minimum !== undefined && value < declaration.minimum) ||
      (declaration.maximum !== undefined && value > declaration.maximum))
  )
    invalid("Invalid number setting")
}
function validateSettingDeclaration(s: Record<string, unknown>) {
  fields(
    s,
    ["type", "title", "default"],
    [
      "description",
      ...(s.type === "string"
        ? ["enum"]
        : s.type === "number"
          ? ["minimum", "maximum"]
          : []),
    ]
  )
  text(s.title)
  if (s.description !== undefined) text(s.description, 4096)
  if (!["boolean", "string", "number"].includes(String(s.type)))
    invalid("Invalid setting type")
  if (s.enum !== undefined) strings(s.enum)
  for (const bound of [s.minimum, s.maximum])
    if (
      bound !== undefined &&
      (typeof bound !== "number" || !Number.isFinite(bound))
    )
      invalid("Invalid setting bound")
  if (
    typeof s.minimum === "number" &&
    typeof s.maximum === "number" &&
    s.minimum > s.maximum
  )
    invalid("Reversed setting range")
  validateSetting(s as unknown as SettingDeclaration, s.default)
}
export function parseResourceDeclaration(input: unknown): ResourceDeclaration {
  const r = record(input)
  fields(
    r,
    r.kind === "directory"
      ? ["kind", "title", "access", "include"]
      : ["kind", "title", "access"]
  )
  text(r.title)
  const access = strings(r.access)
  if (r.kind === "directory") {
    if (
      access.some(
        (a) => !["list", "read", "create", "write", "delete"].includes(a)
      ) ||
      (access.includes("write") && !access.includes("read"))
    )
      invalid("Invalid directory access")
    for (const glob of strings(r.include)) {
      if (
        /[\\\[\]{}!?:\u0000-\u001f]/.test(glob) ||
        glob
          .split("/")
          .some(
            (p) =>
              !p || p === "." || p === ".." || (p.includes("**") && p !== "**")
          )
      )
        invalid("Invalid include glob")
    }
  } else if (r.kind === "text" || r.kind === "eidos") {
    if (
      !access.includes("read") ||
      access.some((a) => a !== "read" && a !== "write")
    )
      invalid("Invalid file access")
  } else if (
    r.kind !== "output" ||
    access.length !== 1 ||
    access[0] !== "write"
  )
    invalid("Invalid resource kind/access")
  return structuredClone(r) as unknown as ResourceDeclaration
}

export function validateIconDefinition(raw: unknown): void {
  if (raw === undefined) return
  if (typeof raw === "string") {
    iconFilePath(raw)
  } else {
    const icon = record(raw)
    fields(icon, [], ["paths", "src", "file"])
    if (icon.paths !== undefined) {
      if (
        !Array.isArray(icon.paths) ||
        !icon.paths.length ||
        icon.paths.length > 16
      )
        invalid("Icon requires 1–16 SVG paths")
      for (const path of icon.paths) {
        if (
          typeof path !== "string" ||
          path.length > 2048 ||
          !/^[Mm][\s\d.,+eE\-MmLlHhVvCcSsQqTtAaZz]+$/.test(path)
        )
          invalid("Invalid icon path")
      }
    }
    if (icon.src !== undefined) iconFilePath(icon.src)
    if (icon.file !== undefined) iconFilePath(icon.file)
    if (
      icon.paths === undefined &&
      icon.src === undefined &&
      icon.file === undefined
    ) {
      invalid("Icon requires paths, src, or file")
    }
  }
}

export function parseManifest(input: unknown): PluginManifest {
  const m = record(input)
  fields(
    m,
    ["apiVersion", "id", "name", "version"],
    [
      "extension",
      "views",
      "actions",
      "formatters",
      "placements",
      "resources",
      "settings",
      "browser",
      "storage",
      "workspace",
      "connections",
      "icon",
      "requires",
      "theme",
      "kind",
    ]
  )
  if (m.icon !== undefined) {
    validateIconDefinition(m.icon)
  }
  const connections = m.connections === undefined ? {} : record(m.connections)
  if (Object.keys(connections).length > 8) invalid("Too many connections")
  for (const [key, raw] of Object.entries(connections)) {
    id(key)
    const connection = record(raw)
    fields(connection, ["title", "url"], ["configurable"])
    if (
      connection.configurable !== undefined &&
      typeof connection.configurable !== "boolean"
    )
      invalid("Invalid configurable connection")
    text(connection.title)
    text(connection.url)
    let url: URL
    try {
      url = new URL(String(connection.url))
    } catch {
      invalid("Invalid connection URL")
    }
    if (
      url!.protocol !== "https:" ||
      url!.username ||
      url!.password ||
      url!.hash ||
      url!.search
    )
      invalid("Connection requires a fixed HTTPS URL")
  }
  if (m.storage !== undefined) {
    const storage = record(m.storage)
    fields(storage, ["maxBytes"])
    if (
      !Number.isSafeInteger(storage.maxBytes) ||
      Number(storage.maxBytes) < 1 ||
      Number(storage.maxBytes) > 1024 ** 3
    )
      invalid("Storage quota must be between 1 byte and 1 GiB")
  }
  if (m.workspace !== undefined) {
    const workspace = record(m.workspace)
    fields(workspace, [], ["files"])
    if (workspace.files !== undefined) {
      if (typeof workspace.files === "boolean") {
        if (workspace.files !== true)
          invalid("Invalid workspace files permission")
      } else {
        const files = record(workspace.files)
        fields(files, [], ["read", "write"])
        if (files.read !== undefined && typeof files.read !== "boolean")
          invalid("Invalid workspace files read permission")
        if (files.write !== undefined && typeof files.write !== "boolean")
          invalid("Invalid workspace files write permission")
        if (files.read === false && files.write === false)
          invalid("Invalid workspace files permission")
      }
    }
  }
  if (m.browser !== undefined) {
    const browser = record(m.browser)
    fields(browser, [], ["workers", "networkOrigins"])
    if (browser.workers !== undefined && typeof browser.workers !== "boolean")
      invalid("Invalid worker capability")
    if (browser.networkOrigins !== undefined) {
      const origins = strings(browser.networkOrigins)
      if (origins.length > 8) invalid("Too many network origins")
      for (const origin of origins) {
        let url: URL
        try {
          url = new URL(origin)
        } catch {
          invalid("Invalid network origin")
        }
        if (
          url!.protocol !== "https:" ||
          url!.origin !== origin ||
          !/^[a-z0-9.-]+$/.test(url!.hostname) ||
          url!.username ||
          url!.password
        )
          invalid("Expected exact HTTPS origin")
      }
    }
  }
  if (m.apiVersion !== 1)
    throw new PluginError("UNSUPPORTED_API", "Unsupported plugin API")
  if (m.requires !== undefined) {
    const requirement = record(m.requires)
    fields(requirement, ["pluginApi"], [])
    if (
      typeof requirement.pluginApi !== "string" ||
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(
        requirement.pluginApi
      ) ||
      !requirement.pluginApi
        .split(".")
        .every((p) => Number.isSafeInteger(Number(p)))
    )
      invalid("requires.pluginApi must be a stable major.minor.patch version")
  }
  text(m.id)
  text(m.name)
  text(m.version)
  if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(m.id))
    invalid("Invalid plugin ID")
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(m.version))
    invalid("Invalid plugin version")
  if (m.extension !== undefined) entryPath(m.extension)
  const views = collection(m.views)
  const actions = collection(m.actions)
  const formatters = collection(m.formatters)
  if (m.theme !== undefined) {
    if (m.kind !== "theme") invalid("Theme packages require kind: theme")
    const required = (m.requires as { pluginApi?: string } | undefined)
      ?.pluginApi
    if (
      !required ||
      !(
        Number(required.split(".")[0]) >= 2 ||
        /^1\.(?:[6-9]|[1-9]\d+)\.\d+$/.test(required)
      )
    )
      invalid("Themes require plugin API 1.6.0 or newer")
    const theme = record(m.theme)
    fields(theme, ["stylesheet"], [])
    if (typeof theme.stylesheet !== "string")
      invalid("Theme stylesheet must be a CSS file path")
    if (!themeStylesheetPath(theme.stylesheet))
      parseThemeStylesheet(theme.stylesheet, true)
  }
  if (m.kind !== undefined && m.kind !== "theme") invalid("Invalid plugin kind")
  if (m.kind === "theme" && !m.theme)
    invalid("Theme packages require a theme declaration")
  for (const formatter of formatters) {
    fields(formatter, ["id", "title", "extensions"], [])
    text(formatter.title)
    extensions(formatter.extensions)
  }
  if (!views.length && !actions.length && !formatters.length && !m.theme)
    invalid("At least one contribution is required")
  if (
    m.theme &&
    (views.length ||
      actions.length ||
      formatters.length ||
      m.extension ||
      m.placements ||
      m.resources ||
      m.settings ||
      m.storage ||
      m.workspace ||
      m.connections ||
      m.browser)
  )
    invalid("Theme packages cannot contain executable contributions or grants")
  if ((actions.length || formatters.length) && !m.extension)
    invalid("Actions require an extension entry")
  for (const [items, isView] of [
    [views, true],
    [actions, false],
  ] as const) {
    for (const v of items) {
      fields(
        v,
        isView
          ? ["id", "title", "entry", "context"]
          : ["id", "title", "context"],
        isView
          ? ["access", "configuration", "icon"]
          : ["access", "extensions", "icon"]
      )
      text(v.title)
      if (v.icon !== undefined) validateIconDefinition(v.icon)
      if (
        ![
          isView ? "page" : "workspace",
          "file",
          "document",
          "table",
          ...(isView ? ["eidos", "media"] : []),
        ].includes(String(v.context))
      )
        invalid("Invalid contribution context")
      if (isView) entryPath(v.entry)
      if (v.configuration !== undefined) {
        if (!isView || v.context !== "table")
          invalid("Configuration requires a table view")
        const schema = record(v.configuration)
        fields(schema, ["type", "properties"])
        if (schema.type !== "object")
          invalid("Configuration must be an object schema")
        const properties = record(schema.properties)
        if (
          Object.keys(properties).length > 32 ||
          JSON.stringify(schema).length > 16384
        )
          invalid("Configuration schema is too large")
        for (const [key, raw] of Object.entries(properties)) {
          id(key)
          const property = record(raw)
          const { "x-field": field, ...setting } = property
          if (
            field !== undefined &&
            (field !== true ||
              setting.type !== "string" ||
              setting.default !== "" ||
              setting.enum !== undefined)
          )
            invalid("Field selectors require a string with an empty default")
          // Reuse the same scalar schema validation as plugin settings.
          validateSettingDeclaration(setting)
        }
      }
      if (
        v.access !== undefined &&
        (!["read", "write"].includes(String(v.access)) ||
          (v.context === "media" && v.access !== "read") ||
          ![
            "file",
            "document",
            "table",
            ...(isView ? ["eidos", "media"] : ["workspace"]),
          ].includes(String(v.context)))
      )
        invalid("Invalid context access")
      if (v.extensions !== undefined) {
        if (v.context !== "document" && v.context !== "file")
          invalid("Only document or file actions have extensions")
        extensions(v.extensions)
      }
    }
  }
  if (m.placements !== undefined && !Array.isArray(m.placements))
    invalid("Invalid placements")
  for (const raw of (m.placements ?? []) as unknown[]) {
    const p = record(raw)
    const view = views.find((v) => v.id === p.view)
    const action = actions.find((a) => a.id === p.action)
    switch (p.location) {
      case "navigation":
      case "plugin/settings":
      case "table/view":
      case "file/open":
        fields(
          p,
          p.location === "file/open"
            ? ["location", "view", "extensions"]
            : ["location", "view"]
        )
        if (
          !view ||
          view.context !==
            (
              {
                navigation: "page",
                "plugin/settings": "page",
                "table/view": "table",
                "file/open":
                  view.context === "eidos"
                    ? "eidos"
                    : view.context === "media"
                      ? "media"
                      : view.context === "file"
                        ? "file"
                        : "document",
              } as const
            )[p.location]
        )
          invalid("Placement/view mismatch")
        if (p.location === "file/open") {
          if (view?.context === "eidos") {
            if (strings(p.extensions).join() !== ".eidos")
              invalid("Eidos views require only .eidos")
          } else if (view?.context === "file") {
            for (const ext of strings(p.extensions)) {
              if (!/^\.[a-z0-9]{1,16}$/.test(ext)) invalid("Invalid extension")
            }
          } else extensions(p.extensions)
        }
        break
      case "command-palette":
      case "file/context":
      case "table/context":
      case "view/toolbar":
      case "keybinding":
        fields(
          p,
          [
            "location",
            "action",
            ...(p.location === "view/toolbar"
              ? ["view"]
              : p.location === "keybinding"
                ? ["key"]
                : []),
          ],
          p.location === "keybinding" ? ["mac", "linux"] : []
        )
        if (!action) invalid("Unknown action")
        if (p.location === "table/context" && action.context !== "table")
          invalid("Table action requires table context")
        if (
          p.location === "file/context" &&
          action.context !== "document" &&
          action.context !== "file"
        )
          invalid("File action requires document or file context")
        if (
          p.location === "view/toolbar" &&
          (!view ||
            action.context !==
              (view.context === "page" ? "workspace" : view.context))
        )
          invalid("Toolbar context mismatch")
        if (p.location === "keybinding") {
          text(p.key)
          if (p.mac !== undefined) text(p.mac)
          if (p.linux !== undefined) text(p.linux)
        }
        break
      default:
        invalid("Unknown placement")
    }
  }
  for (const [key, raw] of Object.entries(
    m.resources === undefined ? {} : record(m.resources)
  )) {
    id(key)
    parseResourceDeclaration(raw)
  }
  let settingsBytes = 0
  for (const [key, raw] of Object.entries(
    m.settings === undefined ? {} : record(m.settings)
  )) {
    id(key)
    const s = record(raw)
    validateSettingDeclaration(s)
    settingsBytes += new TextEncoder().encode(
      JSON.stringify({ [key]: s.default })
    ).length
  }
  if (settingsBytes > 65536) invalid("Settings exceed 64 KiB")
  // Copy validated data so callers cannot mutate a previously checked descriptor.
  return structuredClone(m) as unknown as PluginManifest
}
