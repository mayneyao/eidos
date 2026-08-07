import type { EidosLiteLanguage } from "./contracts"

export type EidosLiteLocale = Exclude<EidosLiteLanguage, "system">
export type EidosLiteMessageValues = Record<string, string | number>

const zh: Record<string, string> = {
  "Settings…": "设置…",
  File: "文件",
  Edit: "编辑",
  View: "视图",
  Window: "窗口",
  Help: "帮助",
  "Eidos Documentation": "Eidos 文档",
  "Eidos Website": "Eidos 官网",
  Settings: "设置",
  "Settings sections": "设置分类",
  Appearance: "外观",
  Theme: "主题",
  "Follow the system or keep one appearance.": "跟随系统，或始终使用指定外观。",
  System: "跟随系统",
  Light: "浅色",
  Dark: "深色",
  Language: "语言",
  "Use the system language or choose one for Eidos Lite.":
    "跟随系统语言，或为 Eidos Lite 指定语言。",
  English: "English",
  Chinese: "简体中文",
  "Account & Sync": "账户与同步",
  "Signed in": "已登录",
  "Not signed in": "未登录",
  "Manage account": "管理账户",
  "Signing out…": "正在退出…",
  "Sign out": "退出登录",
  "Signing in…": "正在登录…",
  "Sign in": "登录",
  "Your email and avatar are cached for a stable interface. Sign-in credentials remain in secure system storage.":
    "邮箱和头像会被缓存以保持界面稳定，登录凭据仍保存在系统安全存储中。",
  Spaces: "空间",
  "Keyboard Shortcuts": "键盘快捷键",
  Workspace: "工作区",
  "Toggle Space Explorer": "切换空间资源管理器",
  "Toggle theme": "切换主题",
  "Toggle version history": "切换版本历史",
  "Toggle Sync": "切换同步面板",
  "Select a shortcut, then press a new key combination. Press Escape to cancel or Backspace to clear it.":
    "选择一个快捷键，然后按下新的组合键。按 Escape 取消，按 Backspace 清除。",
  "Restore all defaults": "全部恢复默认",
  "Press shortcut…": "请按快捷键…",
  "Not set": "未设置",
  Modified: "已修改",
  "Clear shortcut": "清除快捷键",
  "Clear {command}": "清除“{command}”快捷键",
  "Restore default": "恢复默认",
  "Restore default for {command}": "恢复“{command}”的默认快捷键",
  "This shortcut is reserved by the application or system.":
    "此快捷键已被应用或系统保留。",
  "Include Command, Control, or Alt in the shortcut.":
    "快捷键需包含 Command、Control 或 Alt。",
  "Already used by {command}.": "已被“{command}”使用。",
  "Custom shortcuts apply to workspace windows. Standard text editing shortcuts remain unchanged inside inputs and editors.":
    "自定义快捷键适用于工作区窗口；输入框和编辑器中的标准文本编辑快捷键保持不变。",
  "Automatic versions": "自动版本",
  "Save a new version after local activity settles. Off by default so background versioning never interrupts long local operations.":
    "本地操作稳定后保存新版本。默认关闭，避免后台版本记录干扰耗时的本地操作。",
  "Default location for new Spaces": "新建空间的默认位置",
  "Documents folder (system default)": "文稿文件夹（系统默认）",
  "Use default": "使用默认位置",
  "Choosing…": "正在选择…",
  "Choose…": "选择…",
  "Manual saved versions remain available. Existing Spaces and their files are never moved.":
    "手动保存的版本仍然可用；现有空间及其文件永远不会被移动。",
  Updates: "更新",
  "Automatically download updates": "自动下载更新",
  "Check in the background and download signed updates when available.":
    "在后台检查，并在有新版本时下载经签名的更新。",
  "Check for updates": "检查更新",
  "Download update": "下载更新",
  "Software update": "软件更新",
  "Current version: {version}": "当前版本：{version}",
  "Checking for updates…": "正在检查更新…",
  "You're up to date.": "已是最新版本。",
  "Update {version} is available.": "可以更新到 {version}。",
  "Downloading update… {percent}%": "正在下载更新… {percent}%",
  "Version {version} is ready to install.": "{version} 版本已可安装。",
  "Restart to update": "重启并更新",
  "Updates are available only in a packaged production build.":
    "仅已打包的生产版本可使用更新。",
  "Could not check for updates. Try again later.": "无法检查更新，请稍后重试。",
  About: "关于",
  "Local-first work for Eidos Files.": "本地优先的 Eidos File 工作方式。",
  Documentation: "文档",
  "Eidos website": "Eidos 官网",
  "Diagnostics copied": "诊断信息已复制",
  "Copy diagnostics": "复制诊断信息",
  "Show logs folder": "显示日志文件夹",
  "Local-first workspace": "本地优先工作区",
  "Choose a Space": "选择空间",
  "Open an ordinary folder and work across its Eidos Files. Local work never requires an account.":
    "打开普通文件夹，即可跨多个 Eidos File 工作。本地工作始终无需账户。",
  "Opening Space…": "正在打开空间…",
  "New Space": "新建空间",
  "Open Space": "打开空间",
  "Open Synced Space": "打开已同步空间",
  "Save Local Copy": "保存本地副本",
  "Recent Spaces": "最近空间",
  "Local folders": "本地文件夹",
  "No recent Spaces": "没有最近空间",
  "Folder unavailable": "文件夹不可用",
  "Remove from recents": "从最近空间中移除",
  "Remove {name} from recent Spaces": "从最近空间中移除 {name}",
  "Spaces remain ordinary folders. Removing one here never deletes its files.":
    "空间始终是普通文件夹。从此处移除空间绝不会删除其文件。",
  "Show Space Explorer": "显示空间资源管理器",
  "Collapse Space Explorer": "收起空间资源管理器",
  "Document navigation": "文档导航",
  "Go back": "后退",
  "Go forward": "前进",
  "Space file actions": "空间文件操作",
  "New File": "新建文件",
  "New Eidos File": "新建 Eidos File",
  "New folder": "新建文件夹",
  "File name": "文件名",
  "Folder name": "文件夹名称",
  Create: "创建",
  "Use .eidos for an Eidos File. Another extension, such as .md or .txt, creates an empty text file. Names without an extension use .eidos.":
    "使用 .eidos 创建 Eidos 文件；输入其他后缀（如 .md 或 .txt）将创建空白文本文件。未输入后缀时会使用 .eidos。",
  "Rename {name}": "重命名 {name}",
  "New name": "新名称",
  Rename: "重命名",
  "Move {name}": "移动 {name}",
  "Copy {name}": "复制 {name}",
  "Destination folder (blank for Space root)":
    "目标文件夹（留空表示空间根目录）",
  Move: "移动",
  Copy: "复制",
  Open: "打开",
  Preview: "预览",
  "Copy Path": "复制路径",
  "Copy Relative Path": "复制相对路径",
  "Move {name} to Trash?": "将 {name} 移到废纸篓？",
  "Move to Trash": "移到废纸篓",
  item: "项目",
  Cancel: "取消",
  "Working…": "正在处理…",
  "The item will leave this Space and can be recovered from the system Trash.":
    "该项目将离开此空间，但仍可从系统废纸篓中恢复。",
  "Import files": "导入文件",
  "Refresh Space Explorer": "刷新空间资源管理器",
  "Loading Space Explorer…": "正在加载空间资源管理器…",
  "Resize Space Explorer": "调整空间资源管理器宽度",
  "Space actions": "空间操作",
  "Dismiss error": "关闭错误",
  "Loading change details…": "正在加载变更详情…",
  "Loading Eidos File editor…": "正在加载 Eidos File 编辑器…",
  "Loading text editor…": "正在加载文本编辑器…",
  "Text editor for {path}": "{path} 的文本编辑器",
  "Read-only preview of {path}": "{path} 的只读预览",
  "Contents of {path}": "{path} 的内容",
  Editable: "可编辑",
  "Read-only": "只读",
  Saved: "已保存",
  "Saving…": "正在保存…",
  "Unsaved changes": "有未保存的更改",
  "Changed on disk": "磁盘文件已更改",
  "Save failed": "保存失败",
  Save: "保存",
  "Reload from disk": "从磁盘重新加载",
  "Empty file": "空文件",
  "Showing the first 2 MB. The file remains unchanged on disk.":
    "仅显示前 2 MB，磁盘上的文件不会被更改。",
  "Preview unavailable": "无法预览",
  "Reveal in Finder": "在访达中显示",
  Image: "图片",
  Video: "视频",
  Audio: "音频",
  "{kind} preview of {path}": "{path} 的{kind}预览",
  "Linked files are not previewed, so the Space boundary stays explicit.":
    "为明确 Space 边界，不会预览符号链接文件。",
  "This item is not a regular file and cannot be shown as text.":
    "该项目不是普通文件，无法以文本形式显示。",
  "This file does not look like UTF-8 or UTF-16 text. Eidos Lite left it closed instead of choosing another application.":
    "该文件不像 UTF-8 或 UTF-16 文本。Eidos Lite 已保持关闭，不会擅自选择其他应用。",
  "Create your first Eidos File": "创建第一个 Eidos File",
  "Start with a local {extension} file inside this Space. It remains an ordinary file you own and can move or back up.":
    "先在此空间内创建本地 {extension} 文件。它仍是属于你的普通文件，可随时移动或备份。",
  "Open an Eidos File": "打开 Eidos File",
  "Choose any {extension} file in this Space. Recently used files reopen from a small in-memory runtime cache.":
    "选择此空间中的任意 {extension} 文件。最近使用的文件会从小型内存运行时缓存中重新打开。",
  "Recent files": "最近打开",
  "Open a file from the Space Explorer to start working.":
    "从左侧目录树选择一个文件开始工作。",
  "Space root": "空间根目录",
  "Open {name}": "打开 {name}",
  "{name} is no longer available in this Space.": "{name} 已不在此空间中。",
  "Choose Default Location for New Spaces": "选择新建空间的默认位置",
  "Use This Folder": "使用此文件夹",
  "Open Folder as Space": "将文件夹作为空间打开",
  "Create Space": "创建空间",
  "Untitled Space": "未命名空间",
  "Space name": "空间名称",
  "Import files into Space": "导入文件到空间",
  Import: "导入",
  "Export Eidos File CSV": "导出 Eidos File CSV",
  "Export CSV": "导出 CSV",
}

export function resolveEidosLiteLocale(
  preference: EidosLiteLanguage,
  systemLocale: string
): EidosLiteLocale {
  if (preference !== "system") return preference
  return systemLocale.toLowerCase().startsWith("zh") ? "zh" : "en"
}

export function translateEidosLite(
  locale: EidosLiteLocale,
  message: string,
  values: EidosLiteMessageValues = {}
): string {
  const template = locale === "zh" ? (zh[message] ?? message) : message
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(String(value)),
    template
  )
}
