import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

const en = {
  languageAction: "切换到中文",
  navEditor: "Editor",
  navDocs: "Docs",
  navGraft: "Graft Playground",
  loadingDocs: "Loading Base documentation…",
  heroEyebrow: "Local Base editor",
  heroTitleOne: "Open a Base.",
  heroTitleTwo: "Keep it yours.",
  heroLede:
    "Edit a local .base file with the same Grid, Gallery, and Kanban experience as Eidos Desktop. No account. No upload.",
  openingBase: "Opening Base…",
  openBase: "Open .base file",
  openSample: "Open sample Base",
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
  formatTitleTwo: "A complete Base.",
  formatIntro:
    "A .base file is a portable SQLite database, not an opaque export. Its versioned schema describes records, typed properties, relations, and saved views; Desktop and Web share the same runtime contract.",
  formatFile: "01 / file",
  formatFileTitle: "SQLite container",
  formatFileBody:
    "One local file. Standard pages and transactions. Inspectable with ordinary SQLite tooling and easy to back up or move.",
  formatMeaning: "02 / meaning",
  formatMeaningTitle: "Versioned Base schema",
  formatMeaningBody:
    "Metadata describes tables, fields, types, relations, and view definitions without hiding them behind a hosted API.",
  formatBehavior: "03 / behavior",
  formatBehaviorTitle: "Shared runtime contract",
  formatBehaviorBody:
    "Validation, migrations, queries, and edits live in @eidos.space/base; storage drivers supply only the SQLite connection.",
  formatExperience: "04 / experience",
  formatExperienceTitle: "Pluggable views",
  formatExperienceBody:
    "Grid, Gallery, and Kanban are presentations over the same records and declarative view state—not separate copies.",
  principleOwned: "User-owned file",
  principleAccount: "No account required",
  principleDrivers: "Browser + Desktop drivers",
  principleLocal: "No server round-trip",
  readBaseDocs: "Read the Base format RFCs",
  graftEyebrow: "Git-like version control for SQLite",
  graftTitleOne: "Your Base is a file.",
  graftTitleTwo: "Graft gives it history.",
  graftIntro:
    "Base defines the open data format. Graft is the optional version layer: commit meaningful snapshots, inspect row-level diffs, move through history, work on branches, and synchronize remotes.",
  stackEyebrow: "The Eidos data stack",
  stackTitle: "Format, history, application.",
  stackGraft: "SQLite version engine",
  stackGraftBody:
    "Graft gives SQLite commit history, logical diffs, branches, checkout, reset, and repository synchronization.",
  openGraft: "Open Graft Playground",
  stackBase: "Open format + multidimensional UI",
  stackBaseBody:
    "Base defines the portable file, shared runtime, typed fields, relations, saved views, and table experiences.",
  stackEidos: "Local-first application",
  stackEidosBody:
    "Eidos Desktop combines Base, documents, files, extensions, local AI, and Graft workflows into one personal data system.",
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
    "Version control stays a separate, explicit workflow. Open Graft Playground to experience commits, row-level SQLite diffs, branches, restore, and sync in the browser.",
  demoEyebrow: "Live runtime · no mock data layer",
  demoTitle: "A real Base, ready to edit",
  demoIntro:
    "Double-click a cell or press Enter. Search, change a status, tick a checkbox, or add a record—the same worker and Base runtime power the full editor.",
  openFullEditor: "Open full editor",
  demoLoading: "Loading SQLite WASM…",
  demoChanged: "Local demo changed",
  demoLive: "Live Base · 2,500 records",
  demoSearch: "Search demo",
  demoReset: "Reset",
  demoUnavailable: "Live demo unavailable",
  tryAgain: "Try again",
  demoOpening: "Opening the bundled .base file locally…",
  demoTemporary: "Demo edits stay in this temporary browser copy.",
  workerIsolated: "SQLite 1 · Worker isolated",
  demoProperty:
    "{field} is backed by the shared Base field contract. Open the full editor to change its schema.",
  editorSaved: "Saved",
  editorOpening: "Opening local file…",
  editorBrowserChanges: "Changes stay in browser",
  editorUnsaved: "Unsaved changes",
  editorSaving: "Saving Base…",
  editorDownloaded: "Downloaded a copy",
  editorSavedOriginal: "Saved to original",
  editorAttention: "Save needs attention",
  editorConflict: "Original changed",
  editorImported: "Imported copy",
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
    "Changing type uses the shared Base conversion rules and may normalize existing values.",
  viewPreserved: "View preserved, renderer unavailable",
  viewRemains: "{view} remains in your Base.",
  viewUnavailableBody:
    "This standalone app does not recreate private Gallery or Kanban UI. Choose a Grid view now; the public renderer can plug in when its package contract lands.",
  originalFile: "Original file",
  recoveryOn: "Recovery on",
  memoryOnly: "Memory only",
  allLocal: "All processing local",
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
  languageAction: "Switch to English",
  navEditor: "编辑器",
  navDocs: "文档",
  navGraft: "Graft Playground",
  loadingDocs: "正在加载 Base 文档…",
  heroEyebrow: "本地 Base 编辑器",
  heroTitleOne: "打开 Base。",
  heroTitleTwo: "数据仍属于你。",
  heroLede:
    "直接编辑本地 .base 文件，复用 Eidos Desktop 的 Grid、Gallery 与 Kanban 体验。无需账号，不上传文件。",
  openingBase: "正在打开 Base…",
  openBase: "打开 .base 文件",
  openSample: "打开示例 Base",
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
  formatTitleTwo: "完整的多维表格。",
  formatIntro:
    ".base 是可携带的 SQLite 数据库，不是不透明的导出文件。版本化 schema 描述记录、字段类型、关系和视图；桌面端与 Web 端共享同一 runtime 契约。",
  formatFile: "01 / 文件",
  formatFileTitle: "SQLite 容器",
  formatFileBody:
    "一个本地文件，使用标准页和事务；可用普通 SQLite 工具检查，也便于备份和迁移。",
  formatMeaning: "02 / 语义",
  formatMeaningTitle: "版本化 Base schema",
  formatMeaningBody:
    "元数据公开描述数据表、字段、类型、关系和视图定义，不依赖托管 API 才能理解。",
  formatBehavior: "03 / 行为",
  formatBehaviorTitle: "共享 runtime 契约",
  formatBehaviorBody:
    "验证、迁移、查询和编辑统一由 @eidos.space/base 提供；存储驱动只实现 SQLite 连接。",
  formatExperience: "04 / 体验",
  formatExperienceTitle: "可插拔视图",
  formatExperienceBody:
    "Grid、Gallery 与 Kanban 是同一份记录和声明式视图状态的不同呈现，不是多份数据副本。",
  principleOwned: "用户拥有文件",
  principleAccount: "无需账号",
  principleDrivers: "浏览器 + 桌面驱动",
  principleLocal: "无需服务端往返",
  readBaseDocs: "阅读 Base 格式 RFC",
  graftEyebrow: "面向 SQLite 的类 Git 版本管理",
  graftTitleOne: "Base 是你的文件。",
  graftTitleTwo: "Graft 赋予它历史。",
  graftIntro:
    "Base 定义开放数据格式，Graft 则是可选的版本层：提交有意义的快照、检查行级 diff、回到历史版本、使用分支，并与远端同步。",
  stackEyebrow: "Eidos 数据栈",
  stackTitle: "格式、历史与应用。",
  stackGraft: "SQLite 版本引擎",
  stackGraftBody:
    "Graft 为 SQLite 提供提交历史、逻辑 diff、分支、checkout、reset 与仓库同步。",
  openGraft: "打开 Graft Playground",
  stackBase: "开放格式 + 多维表格 UI",
  stackBaseBody:
    "Base 定义可携带文件、共享 runtime、字段类型、关系、视图状态与多维表格体验。",
  stackEidos: "本地优先应用",
  stackEidosBody:
    "Eidos Desktop 将 Base、文档、文件、扩展、本地 AI 与 Graft 工作流组合为完整的个人数据系统。",
  graftCommit: "提交",
  graftCommitBody: "为一组相关的数据表和 schema 修改写下清晰的提交说明。",
  graftDiff: "差异",
  graftDiffBody: "提交前检查支持的行级变化与 SQLite 诊断信息。",
  graftBranch: "分支与检出",
  graftBranchBody: "在不同工作线之间切换，或回到更早的修订版本。",
  graftSync: "推送、拉取与合并",
  graftSyncBody: "同步仓库，并通过明确流程解决冲突。",
  graftBoundary:
    "版本管理保持独立、明确的工作流。前往 Graft Playground，可在浏览器中体验提交、SQLite 行级 diff、分支、恢复与同步。",
  demoEyebrow: "实时 runtime · 没有伪造数据层",
  demoTitle: "真实 Base，可直接编辑",
  demoIntro:
    "双击单元格或按 Enter。你可以搜索、更改状态、勾选复选框或新增记录；它与完整编辑器使用同一个 Worker 和 Base runtime。",
  openFullEditor: "打开完整编辑器",
  demoLoading: "正在加载 SQLite WASM…",
  demoChanged: "本地示例已修改",
  demoLive: "实时 Base · 2,500 条记录",
  demoSearch: "搜索示例",
  demoReset: "重置",
  demoUnavailable: "实时示例不可用",
  tryAgain: "重试",
  demoOpening: "正在本地打开内置 .base 文件…",
  demoTemporary: "示例修改只保留在当前浏览器临时副本中。",
  workerIsolated: "SQLite 1 · Worker 隔离",
  demoProperty:
    "{field} 使用共享 Base 字段契约；请在完整编辑器中修改其 schema。",
  editorSaved: "已保存",
  editorOpening: "正在打开本地文件…",
  editorBrowserChanges: "修改保留在浏览器中",
  editorUnsaved: "有未保存修改",
  editorSaving: "正在保存 Base…",
  editorDownloaded: "已下载副本",
  editorSavedOriginal: "已保存到原文件",
  editorAttention: "保存需要处理",
  editorConflict: "原文件已变化",
  editorImported: "导入的副本",
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
  typeConversion: "修改类型会使用共享 Base 转换规则，并可能规范化已有值。",
  viewPreserved: "视图已保留，当前没有可用渲染器",
  viewRemains: "{view} 仍完整保存在你的 Base 中。",
  viewUnavailableBody:
    "这个独立应用不会复制私有的 Gallery 或 Kanban UI。现在可选择 Grid 视图；公共渲染器包完成后可直接接入。",
  originalFile: "原文件",
  recoveryOn: "恢复已启用",
  memoryOnly: "仅内存",
  allLocal: "所有处理均在本地",
  newRecord: "新建记录",
  loadingRecords: "正在加载记录…",
  records: "{count} 条记录",
  noVisibleProperties: "此视图中没有可见字段。",
  chooseAnotherView: "请选择其他视图，或在 Eidos Desktop 中显示字段。",
  editProperty: "编辑 {field} 字段",
  launchFooter: "默认本地 · 底层 SQLite · 开放 runtime 边界",
}

export type Locale = "en" | "zh"
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

function initialLocale(): Locale {
  const stored = localStorage.getItem("eidos-base-locale")
  if (stored === "en" || stored === "zh") return stored
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en"
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale)

  useEffect(() => {
    localStorage.setItem("eidos-base-locale", locale)
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"
  }, [locale])

  const value = useMemo<I18nContextValue>(() => {
    const t: Translator = (key, values = {}) => {
      const template = (locale === "zh" ? zh : en)[key]
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
