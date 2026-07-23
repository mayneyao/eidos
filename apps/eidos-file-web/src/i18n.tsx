import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

const en = {
  languageSelector: "Language",
  navEditor: "Editor",
  navInspector: "SQLite",
  navInspectorQualifier: "Inspector",
  openSQLiteInspector: "Open the read-only SQLite Inspector in a new tab",
  navDocs: "Open Format",
  navGraft: "Version Control",
  navGraftCompact: "Version",
  loadingDocs: "Loading Eidos File documentation…",
  heroEyebrow: "Local Eidos File editor",
  heroTitleOne: "Open an Eidos File.",
  heroTitleTwo: "Keep it yours.",
  heroLede:
    "Edit a local .eidos file with the same Grid, Gallery, and Kanban experience as Eidos Desktop. No account. No upload.",
  openingEidosFile: "Opening Eidos File…",
  creatingEidosFile: "Creating blank Eidos File…",
  createEidosFile: "New blank Eidos File",
  newEidosFile: "New",
  openEidosFile: "Open .eidos file",
  openSample: "Open sample Eidos File",
  returnHome: "Return to Eidos File home",
  returnHomeRecoverable:
    "Return home? Your unsaved working copy will remain available for recovery. The original file has not been updated.",
  returnHomeDiscard:
    "Return home and discard these unsaved changes? This temporary working copy cannot be recovered.",
  privacyDirect:
    "This browser can save changes back to the original file after you grant access.",
  privacyCopy:
    "This browser imports a private working copy. Save creates a new download; it cannot replace the original.",
  launchFormatLabel: "Format",
  launchViewsLabel: "Views",
  launchRuntimeLabel: "Runtime",
  recoveryAvailable: "Unsaved work is available for {file}",
  recoveryPrivate: "Recovered from this browser’s private storage.",
  recoverEdits: "Recover edits",
  discardCopy: "Discard copy",
  formatEyebrow: "Open multidimensional table format",
  formatTitleOne: "One file.",
  formatTitleTwo: "Many useful views.",
  formatIntro:
    "A .eidos file is a portable SQLite database, not an opaque export. Its versioned schema describes records, typed properties, relations, and saved views; Desktop and Web share the same runtime contract.",
  formatFile: "01 / file",
  formatFileTitle: "SQLite container",
  formatFileBody:
    "One local file. Standard pages and transactions. Inspectable with ordinary SQLite tooling and easy to back up or move.",
  formatMeaning: "02 / meaning",
  formatMeaningTitle: "Versioned Eidos File schema",
  formatMeaningBody:
    "Metadata describes tables, fields, types, relations, and view definitions without hiding them behind a hosted API.",
  formatBehavior: "03 / behavior",
  formatBehaviorTitle: "Shared runtime contract",
  formatBehaviorBody:
    "Schema rules, queries, and edits live in @eidos.space/eidos-file; storage drivers supply only the SQLite connection.",
  formatExperience: "04 / experience",
  formatExperienceTitle: "Pluggable views",
  formatExperienceBody:
    "Grid, Gallery, and Kanban are presentations over the same records and declarative view state—not separate copies.",
  principleOwned: "User-owned file",
  principleAccount: "No account required",
  principleDrivers: "Browser + Desktop drivers",
  principleLocal: "No server round-trip",
  readEidosFileDocs: "Read the Eidos File format reference",
  graftEyebrow: "Git-like version control for SQLite",
  graftTitleOne: "Your Eidos File is a file.",
  graftTitleTwo: "Graft gives it history.",
  graftIntro:
    "Eidos File defines the open data format. Graft is the optional version layer: commit meaningful snapshots, inspect row-level diffs, move through history, work on branches, and synchronize remotes.",
  stackEyebrow: "The Eidos data stack",
  stackTitle: "Format, history, application.",
  stackGraft: "SQLite version engine",
  stackGraftBody:
    "Graft gives SQLite commit history, logical diffs, branches, checkout, reset, and repository synchronization.",
  openGraft: "Open version control",
  stackEidosFile: "Open format + multidimensional UI",
  stackEidosFileBody:
    "Eidos File defines the portable file, shared runtime, typed fields, relations, saved views, and table experiences.",
  stackEidos: "Local-first application",
  stackEidosBody:
    "Eidos Desktop combines Eidos File, documents, files, extensions, local AI, and Graft workflows into one personal data system.",
  graftCommit: "Commit",
  graftCommitBody: "Name a coherent set of local table and schema changes.",
  graftDiff: "Diff",
  graftDiffBody:
    "Review supported row changes and SQLite diagnostics before commit.",
  graftBranch: "Branch & checkout",
  graftBranchBody:
    "Move between lines of work or return to an earlier revision.",
  graftSync: "Push, pull & merge",
  graftSyncBody:
    "Synchronize repositories and resolve conflicts with an explicit workflow.",
  graftBoundary:
    "Version control stays a separate, explicit workflow. Open Version to experience commits, row-level SQLite diffs, branches, restore, and sync in the browser.",
  demoEyebrow: "Live runtime · no mock data layer",
  demoTitle: "A real Eidos File, ready to edit",
  demoIntro:
    "Double-click a cell or press Enter. Search, change a status, tick a checkbox, or add a record—the same worker and Eidos File runtime power the full editor.",
  openFullEditor: "Open full editor",
  demoLoading: "Loading SQLite WASM…",
  demoChanged: "Local demo changed",
  demoLive: "Live Eidos File · 2,500 records",
  demoSearch: "Search demo",
  demoReset: "Reset",
  demoUnavailable: "Live demo unavailable",
  tryAgain: "Try again",
  demoOpening: "Opening the bundled .eidos file locally…",
  demoTemporary: "Demo edits stay in this temporary browser copy.",
  workerIsolated: "SQLite 1 · Worker isolated",
  demoProperty:
    "{field} is backed by the shared Eidos File field contract. Open the full editor to change its schema.",
  editorSaved: "Saved",
  editorOpening: "Opening local file…",
  editorBrowserChanges: "Changes stay in browser",
  editorUnsaved: "Unsaved changes",
  editorSaving: "Saving Eidos File…",
  editorDownloaded: "Downloaded a copy",
  editorSavedOriginal: "Saved to original",
  editorAttention: "Save needs attention",
  editorConflict: "Original changed",
  editorImported: "Imported copy",
  updateAvailableTitle: "Update ready",
  updateAvailableBody: "A newer Eidos File editor is ready. Refresh to use it.",
  updateUnsavedBody:
    "Save or download your changes before refreshing to the new version.",
  updateLater: "Later",
  updateNow: "Update now",
  updateSaveFirst: "Save changes first",
  updatingApp: "Updating…",
  updateFailed:
    "The update could not start. Check your connection and try again.",
  grantWrite: "Grant write access",
  open: "Open",
  save: "Save",
  saveAs: "Save As",
  overwriteOriginal: "Overwrite original",
  reloadOriginal: "Reload original",
  saveRecoverable: "Save recoverable copy",
  searchRecords: "Search records",
  clearSearch: "Clear search",
  property: "Property",
  newProperty: "New property",
  addProperty: "Add property",
  saveProperty: "Save property",
  close: "Close",
  name: "Name",
  type: "Type",
  immutableField:
    "System, relation, and derived types keep their shared runtime definition here.",
  typeConversion:
    "Changing type uses the shared Eidos File conversion rules and may normalize existing values.",
  viewPreserved: "View preserved, renderer unavailable",
  viewRemains: "{view} remains in your Eidos File.",
  viewUnavailableBody:
    "This host does not have a renderer for the saved view. Choose Grid to keep working; the original view type and properties remain unchanged.",
  originalFile: "Original file",
  recoveryOn: "Recovery on",
  memoryOnly: "Memory only",
  allLocal: "All processing local",
  csvActionAriaLabel: "Import CSV as a new Eidos File table",
  csvActionLabel: "Import CSV",
  csvCancel: "Cancel",
  csvChooseAnother: "Choose another",
  csvChoosePrompt: "Choose a CSV file to inspect it.",
  csvDialogTitle: "Import CSV as a new table",
  csvFieldName: "Field {index} name",
  csvFieldType: "{name} type",
  csvFileSummary: "{file} · {count} rows",
  csvImportRows: "Import {count} rows",
  csvImporting: "Importing…",
  csvLocalOnly: "CSV parsing and writes stay local to this editor.",
  csvParsing: "Parsing and inferring fields in the runtime worker…",
  csvPreview: "Preview",
  csvTableName: "Table name",
  csvTitleType: "Title",
  csvTypeCheckbox: "Checkbox",
  csvTypeDate: "Date",
  csvTypeDatetime: "Date & time",
  csvTypeNumber: "Number",
  csvTypeText: "Text",
  csvTypeUrl: "URL",
  csvUnableToImport: "Unable to import CSV",
  csvUnableToRead: "Unable to read CSV",
  csvUnavailable: "The selected CSV is no longer available",
  deleteRowsConfirm: "Delete {count} selected records? This cannot be undone.",
  newRecord: "New record",
  loadingRecords: "Loading records…",
  records: "{count} records",
  noVisibleProperties: "No visible properties in this view.",
  chooseAnotherView:
    "Choose another view or make a property visible in Eidos Desktop.",
  editProperty: "Edit {field} property",
  launchFooter: "Local by default · SQLite underneath · Open runtime boundary",
} as const

type MessageKey = keyof typeof en

const zh: Record<MessageKey, string> = {
  languageSelector: "语言",
  navEditor: "编辑工具",
  navInspector: "SQLite",
  navInspectorQualifier: "检查器",
  openSQLiteInspector: "在新标签页中打开只读 SQLite 检查器",
  navDocs: "开放格式",
  navGraft: "版本管理",
  navGraftCompact: "版本",
  loadingDocs: "正在加载 Eidos File 文档…",
  heroEyebrow: "本地 Eidos File 编辑器",
  heroTitleOne: "打开 Eidos File。",
  heroTitleTwo: "数据仍属于你。",
  heroLede:
    "直接编辑本地 .eidos 文件，复用 Eidos Desktop 的 Grid、Gallery 与 Kanban 体验。无需账号，不上传文件。",
  openingEidosFile: "正在打开 Eidos File…",
  creatingEidosFile: "正在新建空白 Eidos File…",
  createEidosFile: "新建空白 Eidos File",
  newEidosFile: "新建",
  openEidosFile: "打开 .eidos 文件",
  openSample: "打开示例 Eidos File",
  returnHome: "返回 Eidos File 首页",
  returnHomeRecoverable:
    "返回首页？未保存的工作副本仍可恢复，但原文件尚未更新。",
  returnHomeDiscard: "返回首页并丢弃未保存修改？此临时工作副本无法恢复。",
  privacyDirect: "此浏览器获授权后可将修改保存回原文件。",
  privacyCopy: "此浏览器会导入私有工作副本；保存会下载新文件，不会替换原文件。",
  launchFormatLabel: "格式",
  launchViewsLabel: "视图",
  launchRuntimeLabel: "运行时",
  recoveryAvailable: "{file} 有未保存的修改可恢复",
  recoveryPrivate: "已从此浏览器的私有存储中找回。",
  recoverEdits: "恢复修改",
  discardCopy: "丢弃副本",
  formatEyebrow: "开放的多维表格格式",
  formatTitleOne: "一个文件。",
  formatTitleTwo: "多种工作视图。",
  formatIntro:
    ".eidos 是可携带的 SQLite 数据库，不是不透明的导出文件。版本化 schema 描述记录、字段类型、关系和视图；桌面端与 Web 端共享同一 runtime 契约。",
  formatFile: "01 / 文件",
  formatFileTitle: "SQLite 容器",
  formatFileBody:
    "一个本地文件，使用标准页和事务；可用普通 SQLite 工具检查，也便于备份和移动。",
  formatMeaning: "02 / 语义",
  formatMeaningTitle: "版本化 Eidos File schema",
  formatMeaningBody:
    "元数据公开描述数据表、字段、类型、关系和视图定义，不依赖托管 API 才能理解。",
  formatBehavior: "03 / 行为",
  formatBehaviorTitle: "共享 runtime 契约",
  formatBehaviorBody:
    "Schema 规则、查询和编辑统一由 @eidos.space/eidos-file 提供；存储 driver 只实现 SQLite 连接。",
  formatExperience: "04 / 体验",
  formatExperienceTitle: "可插拔视图",
  formatExperienceBody:
    "Grid、Gallery 与 Kanban 是同一份记录和声明式视图状态的不同呈现，不是多份数据副本。",
  principleOwned: "用户拥有文件",
  principleAccount: "无需账号",
  principleDrivers: "浏览器 + 桌面驱动",
  principleLocal: "无需服务端往返",
  readEidosFileDocs: "阅读 Eidos File 格式参考",
  graftEyebrow: "面向 SQLite 的类 Git 版本管理",
  graftTitleOne: "Eidos File 是你的文件。",
  graftTitleTwo: "Graft 赋予它历史。",
  graftIntro:
    "Eidos File 定义开放数据格式，Graft 则是可选的版本层：提交有意义的快照、检查行级 diff、回到历史版本、使用分支，并与远端同步。",
  stackEyebrow: "Eidos 数据栈",
  stackTitle: "格式、历史与应用。",
  stackGraft: "SQLite 版本引擎",
  stackGraftBody:
    "Graft 为 SQLite 提供提交历史、逻辑 diff、分支、checkout、reset 与仓库同步。",
  openGraft: "打开版本控制",
  stackEidosFile: "开放格式 + 多维表格 UI",
  stackEidosFileBody:
    "Eidos File 定义可携带文件、共享 runtime、字段类型、关系、视图状态与多维表格体验。",
  stackEidos: "本地优先应用",
  stackEidosBody:
    "Eidos Desktop 将 Eidos File、文档、文件、扩展、本地 AI 与 Graft 工作流组合为完整的个人数据系统。",
  graftCommit: "提交",
  graftCommitBody: "为一组相关的数据表和 schema 修改写下清晰的提交说明。",
  graftDiff: "差异",
  graftDiffBody: "提交前检查支持的行级变化与 SQLite 诊断信息。",
  graftBranch: "分支与检出",
  graftBranchBody: "在不同工作线之间切换，或回到更早的修订版本。",
  graftSync: "推送、拉取与合并",
  graftSyncBody: "同步仓库，并通过明确流程解决冲突。",
  graftBoundary:
    "版本管理保持独立、明确的工作流。打开“版本”，即可在浏览器中体验提交、SQLite 行级 diff、分支、恢复与同步。",
  demoEyebrow: "实时 runtime · 没有伪造数据层",
  demoTitle: "真实 Eidos File，可直接编辑",
  demoIntro:
    "双击单元格或按 Enter。你可以搜索、更改状态、勾选复选框或新增记录；它与完整编辑器使用同一个 Worker 和 Eidos File runtime。",
  openFullEditor: "打开完整编辑器",
  demoLoading: "正在加载 SQLite WASM…",
  demoChanged: "本地示例已修改",
  demoLive: "实时 Eidos File · 2,500 条记录",
  demoSearch: "搜索示例",
  demoReset: "重置",
  demoUnavailable: "实时示例不可用",
  tryAgain: "重试",
  demoOpening: "正在本地打开内置 .eidos 文件…",
  demoTemporary: "示例修改只保留在当前浏览器临时副本中。",
  workerIsolated: "SQLite 1 · Worker 隔离",
  demoProperty:
    "{field} 使用共享 Eidos File 字段契约；请在完整编辑器中修改其 schema。",
  editorSaved: "已保存",
  editorOpening: "正在打开本地文件…",
  editorBrowserChanges: "修改保留在浏览器中",
  editorUnsaved: "有未保存修改",
  editorSaving: "正在保存 Eidos File…",
  editorDownloaded: "已下载副本",
  editorSavedOriginal: "已保存到原文件",
  editorAttention: "保存需要处理",
  editorConflict: "原文件已变化",
  editorImported: "导入的副本",
  updateAvailableTitle: "新版本已就绪",
  updateAvailableBody: "新版 Eidos File 编辑器已准备好，刷新即可使用。",
  updateUnsavedBody: "请先保存或下载当前修改，再刷新到新版本。",
  updateLater: "稍后",
  updateNow: "立即更新",
  updateSaveFirst: "请先保存修改",
  updatingApp: "正在更新…",
  updateFailed: "暂时无法开始更新。请检查网络后重试。",
  grantWrite: "授予写入权限",
  open: "打开",
  save: "保存",
  saveAs: "另存为",
  overwriteOriginal: "覆盖原文件",
  reloadOriginal: "重新加载原文件",
  saveRecoverable: "保存可恢复副本",
  searchRecords: "搜索记录",
  clearSearch: "清除搜索",
  property: "字段",
  newProperty: "新建字段",
  addProperty: "添加字段",
  saveProperty: "保存字段",
  close: "关闭",
  name: "名称",
  type: "类型",
  immutableField: "系统、关系和派生类型在此保持共享 runtime 定义。",
  typeConversion:
    "修改类型会使用共享 Eidos File 转换规则，并可能规范化已有值。",
  viewPreserved: "视图已保留，当前没有可用渲染器",
  viewRemains: "{view} 仍完整保存在你的 Eidos File 中。",
  viewUnavailableBody:
    "当前宿主没有此已保存视图的渲染器。你可以选择 Grid 继续工作；原视图类型与属性不会被修改。",
  originalFile: "原文件",
  recoveryOn: "恢复已启用",
  memoryOnly: "仅内存",
  allLocal: "所有处理均在本地",
  csvActionAriaLabel: "将 CSV 导入为新的 Eidos File 数据表",
  csvActionLabel: "导入 CSV",
  csvCancel: "取消",
  csvChooseAnother: "选择其他文件",
  csvChoosePrompt: "选择 CSV 文件并检查内容。",
  csvDialogTitle: "将 CSV 导入为新数据表",
  csvFieldName: "字段 {index} 名称",
  csvFieldType: "{name} 类型",
  csvFileSummary: "{file} · {count} 行",
  csvImportRows: "导入 {count} 行",
  csvImporting: "正在导入…",
  csvLocalOnly: "CSV 解析和写入仅在此编辑器本地完成。",
  csvParsing: "正在 runtime worker 中解析内容并推断字段…",
  csvPreview: "预览",
  csvTableName: "数据表名称",
  csvTitleType: "标题",
  csvTypeCheckbox: "复选框",
  csvTypeDate: "日期",
  csvTypeDatetime: "日期与时间",
  csvTypeNumber: "数字",
  csvTypeText: "文本",
  csvTypeUrl: "链接",
  csvUnableToImport: "无法导入 CSV",
  csvUnableToRead: "无法读取 CSV",
  csvUnavailable: "所选 CSV 已不可用",
  deleteRowsConfirm: "删除选中的 {count} 条记录？此操作无法撤销。",
  newRecord: "新建记录",
  loadingRecords: "正在加载记录…",
  records: "{count} 条记录",
  noVisibleProperties: "此视图中没有可见字段。",
  chooseAnotherView: "请选择其他视图，或在 Eidos Desktop 中显示字段。",
  editProperty: "编辑 {field} 字段",
  launchFooter: "默认本地 · 底层 SQLite · 开放 runtime 边界",
}

export const EIDOS_FILE_LOCALES = [
  {
    value: "en",
    label: "English",
    shortLabel: "EN",
    htmlLang: "en",
    browserLanguagePrefixes: ["en"],
  },
  {
    value: "zh",
    label: "简体中文",
    shortLabel: "中",
    htmlLang: "zh-CN",
    browserLanguagePrefixes: ["zh"],
  },
] as const

export type Locale = (typeof EIDOS_FILE_LOCALES)[number]["value"]
const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, zh }
export type Translator = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translator
}

const I18nContext = createContext<I18nContextValue | null>(null)

function browserLocale(): Locale {
  const stored = window.localStorage.getItem("eidos-file-locale")
  if (EIDOS_FILE_LOCALES.some((option) => option.value === stored)) {
    return stored as Locale
  }
  const browserLanguage = navigator.language.toLowerCase()
  return (
    EIDOS_FILE_LOCALES.find((option) =>
      option.browserLanguagePrefixes.some(
        (prefix) =>
          browserLanguage === prefix || browserLanguage.startsWith(`${prefix}-`)
      )
    )?.value ?? "en"
  )
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode
  initialLocale?: Locale
}) {
  const [locale, setLocale] = useState<Locale>(
    () => initialLocale ?? browserLocale()
  )

  useEffect(() => {
    window.localStorage.setItem("eidos-file-locale", locale)
    document.documentElement.lang =
      EIDOS_FILE_LOCALES.find((option) => option.value === locale)?.htmlLang ??
      "en"
  }, [locale])

  const value = useMemo<I18nContextValue>(() => {
    const t: Translator = (key, values = {}) => {
      const template = MESSAGES[locale][key]
      return Object.entries(values).reduce(
        (text, [name, replacement]) =>
          text.replaceAll(`{${name}}`, String(replacement)),
        template
      )
    }
    return { locale, setLocale, t }
  }, [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error("useI18n must be used inside I18nProvider")
  return value
}
