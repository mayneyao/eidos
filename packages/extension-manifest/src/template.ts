import { analyzeExtensionManifest } from "./manifest"
import type { ExtensionManifestV1 } from "./types"

const PACKAGE_SEGMENT_PATTERN = /^[a-z][a-z0-9-]{1,62}$/

export interface ExtensionCommandTemplateOptions {
  publisher: string
  name: string
  displayName?: string
  engineRange: string
}

export interface ExtensionTextEditorTemplateOptions extends ExtensionCommandTemplateOptions {
  filenamePattern?: string
  mediaType?: string
}

export type ExtensionPanelTemplateOptions = ExtensionCommandTemplateOptions
export type ExtensionEidosFileViewTemplateOptions =
  ExtensionCommandTemplateOptions

export interface ExtensionTemplateFile {
  path: string
  content: string
}

export interface ExtensionTemplate {
  canonicalId: string
  manifest: ExtensionManifestV1
  files: ExtensionTemplateFile[]
}

function defaultDisplayName(name: string): string {
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ")
}

function assertPackageSegment(value: string, label: string): void {
  if (!PACKAGE_SEGMENT_PATTERN.test(value)) {
    throw new Error(
      `${label} must start with a lowercase letter, contain only lowercase letters, numbers, or hyphens, and be 2-63 characters long`
    )
  }
}

function createTemplate(
  manifest: ExtensionManifestV1,
  files: ExtensionTemplateFile[]
): ExtensionTemplate {
  const canonicalId = `${manifest.publisher}.${manifest.name}`
  const analysis = analyzeExtensionManifest(JSON.stringify(manifest), {
    packageDirectoryName: canonicalId,
  })
  if (!analysis.valid) {
    throw new Error(
      `Generated extension template is invalid: ${analysis.diagnostics.map((item) => item.message).join("; ")}`
    )
  }
  return {
    canonicalId,
    manifest,
    files: [
      {
        path: "extension.json",
        content: `${JSON.stringify(manifest, null, 2)}\n`,
      },
      ...files,
    ],
  }
}

export function createExtensionCommandTemplate(
  options: ExtensionCommandTemplateOptions
): ExtensionTemplate {
  assertPackageSegment(options.publisher, "Publisher")
  assertPackageSegment(options.name, "Extension name")
  if (typeof options.engineRange !== "string" || !options.engineRange.trim()) {
    throw new Error("Eidos engine range is required")
  }

  const canonicalId = `${options.publisher}.${options.name}`
  const displayName =
    options.displayName?.trim() || defaultDisplayName(options.name)
  const commandId = `${canonicalId}.hello`
  const manifest: ExtensionManifestV1 = {
    $schema: "https://docs.eidos.space/schemas/extension-manifest.schema.json",
    manifestVersion: 1,
    publisher: options.publisher,
    name: options.name,
    displayName,
    description: `A local Eidos extension for ${displayName}.`,
    version: "0.1.0",
    engines: { eidos: options.engineRange },
    entrypoints: { worker: "src/extension.ts" },
    contributes: {
      commands: [{ id: commandId, title: `Hello from ${displayName}` }],
      menus: {
        "files/context": [
          {
            command: commandId,
            when: "resourceIsDirectory == false",
            group: "extensions",
          },
        ],
      },
    },
    permissions: {
      files: { read: [], write: [] },
      network: [],
    },
  }

  const message = JSON.stringify(`Hello from ${displayName}`)
  return createTemplate(manifest, [
    {
      path: "src/extension.ts",
      content: [
        'import type { ExtensionContext } from "@eidos.space/extension-sdk"',
        "",
        "export function activate(context: ExtensionContext) {",
        "  context.subscriptions.add(",
        "    context.commands.register(",
        `      ${JSON.stringify(commandId)},`,
        "      async (resource) => {",
        `        console.info(${JSON.stringify(`${displayName} command invoked`)}, { path: resource.path })`,
        `        context.window.showNotice(${message})`,
        "      }",
        "    )",
        "  )",
        "}",
        "",
      ].join("\n"),
    },
    {
      path: "README.md",
      content: [
        `# ${displayName}`,
        "",
        `This local extension contributes the \`${commandId}\` command to the Command Palette and file context menu.`,
        "",
        "Run `eidos-extension check .` before installing this package into a Space.",
        "",
      ].join("\n"),
    },
  ])
}

export function createExtensionPanelTemplate(
  options: ExtensionPanelTemplateOptions
): ExtensionTemplate {
  assertPackageSegment(options.publisher, "Publisher")
  assertPackageSegment(options.name, "Extension name")
  if (typeof options.engineRange !== "string" || !options.engineRange.trim()) {
    throw new Error("Eidos engine range is required")
  }

  const canonicalId = `${options.publisher}.${options.name}`
  const displayName =
    options.displayName?.trim() || defaultDisplayName(options.name)
  const commandId = `${canonicalId}.open-summary`
  const panelId = `${canonicalId}.summary`
  const manifest: ExtensionManifestV1 = {
    $schema: "https://docs.eidos.space/schemas/extension-manifest.schema.json",
    manifestVersion: 1,
    publisher: options.publisher,
    name: options.name,
    displayName,
    description: `Count Markdown tasks and show them in a sandboxed ${displayName} panel.`,
    version: "0.1.0",
    engines: { eidos: options.engineRange },
    entrypoints: {
      worker: "src/extension.ts",
      ui: "src/panel.ts",
    },
    contributes: {
      commands: [{ id: commandId, title: `Open ${displayName}` }],
      panels: [{ id: panelId, displayName }],
      menus: {
        "files/context": [
          {
            command: commandId,
            when: "resourceExtname == .md && resourceIsDirectory == false",
            group: "extensions",
          },
          {
            command: commandId,
            when: "resourceExtname == .markdown && resourceIsDirectory == false",
            group: "extensions",
          },
        ],
      },
    },
    permissions: {
      files: { read: ["**/*.md", "**/*.markdown"], write: [] },
      network: [],
    },
  }

  return createTemplate(manifest, [
    {
      path: "src/extension.ts",
      content: [
        'import type { ExtensionContext } from "@eidos.space/extension-sdk"',
        "",
        `const COMMAND_ID = ${JSON.stringify(commandId)}`,
        `const PANEL_ID = ${JSON.stringify(panelId)}`,
        "",
        "function countTasks(markdown: string) {",
        "  const tasks = markdown.match(/^\\s*[-*+]\\s+\\[[ xX]\\]/gm) ?? []",
        "  const completed = tasks.filter((task) => /\\[[xX]\\]/.test(task)).length",
        "  return { total: tasks.length, completed, pending: tasks.length - completed }",
        "}",
        "",
        "export function activate(context: ExtensionContext) {",
        "  context.subscriptions.add(",
        "    context.commands.register(COMMAND_ID, async (resource) => {",
        "      const isMarkdown = /\\.(md|markdown)$/i.test(resource.path)",
        "      const counts = isMarkdown",
        "        ? countTasks(await context.space.files.readText(resource.path))",
        "        : { total: 0, completed: 0, pending: 0 }",
        "      await context.window.openPanel({",
        "        panelId: PANEL_ID,",
        "        state: { path: isMarkdown ? resource.path : null, ...counts },",
        "      })",
        "    })",
        "  )",
        "}",
        "",
      ].join("\n"),
    },
    {
      path: "src/panel.ts",
      content: [
        'import type { ExtensionPanelContext } from "@eidos.space/extension-sdk"',
        "",
        'import "./panel.css"',
        "",
        "interface TaskSummary {",
        "  path: string | null",
        "  total: number",
        "  completed: number",
        "  pending: number",
        "}",
        "",
        "export function activate(context: ExtensionPanelContext) {",
        `  console.info(${JSON.stringify(`${displayName} panel activated`)}, { panelId: context.panelId, sessionId: context.sessionId })`,
        "  const state = (context.state ?? { path: null, total: 0, completed: 0, pending: 0 }) as unknown as TaskSummary",
        '  const shell = document.createElement("main")',
        '  shell.className = "task-summary"',
        "  shell.innerHTML = `",
        '    <p class="eyebrow">MARKDOWN TASKS</p>',
        `    <h1>${displayName}</h1>`,
        '    <p class="resource"></p>',
        '    <section aria-label="Task counts">',
        '      <article><strong data-count="pending"></strong><span>Pending</span></article>',
        '      <article><strong data-count="completed"></strong><span>Completed</span></article>',
        '      <article><strong data-count="total"></strong><span>Total</span></article>',
        "    </section>",
        "  `",
        '  shell.querySelector<HTMLElement>(".resource")!.textContent = state.path ?? "Open the command from a Markdown file to count its tasks."',
        "  shell.querySelector<HTMLElement>('[data-count=\"pending\"]')!.textContent = String(state.pending)",
        "  shell.querySelector<HTMLElement>('[data-count=\"completed\"]')!.textContent = String(state.completed)",
        "  shell.querySelector<HTMLElement>('[data-count=\"total\"]')!.textContent = String(state.total)",
        "  context.root.replaceChildren(shell)",
        "  return { dispose: () => context.root.replaceChildren() }",
        "}",
        "",
      ].join("\n"),
    },
    {
      path: "src/panel.css",
      content: [
        ":root { color: var(--eidos-color-foreground); background: var(--eidos-color-background); font-family: var(--eidos-font-family); }",
        "* { box-sizing: border-box; }",
        "html, body { min-height: 100%; margin: 0; }",
        ".task-summary { max-width: 880px; margin: 0 auto; padding: clamp(32px, 7vw, 96px) 32px; }",
        ".eyebrow { margin: 0 0 12px; color: var(--eidos-color-muted-foreground); font-size: 12px; font-weight: 700; letter-spacing: .14em; }",
        "h1 { margin: 0; font-size: clamp(32px, 5vw, 56px); letter-spacing: -.04em; }",
        ".resource { margin: 14px 0 48px; color: var(--eidos-color-muted-foreground); }",
        "section { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-block: 1px solid var(--eidos-color-border); }",
        "article { display: grid; gap: 8px; padding: 28px 20px; }",
        "article + article { border-left: 1px solid var(--eidos-color-border); }",
        "strong { font-size: clamp(28px, 4vw, 44px); font-variant-numeric: tabular-nums; }",
        "span { color: var(--eidos-color-muted-foreground); font-size: 13px; }",
        "@media (max-width: 560px) { section { grid-template-columns: 1fr; } article + article { border-left: 0; border-top: 1px solid var(--eidos-color-border); } }",
        "",
      ].join("\n"),
    },
    {
      path: "README.md",
      content: [
        `# ${displayName}`,
        "",
        `Run the ${commandId} command from a Markdown file to count its tasks and open the ${panelId} panel.`,
        "",
        "Run `eidos-extension check .` before installing this package into a Space.",
        "",
      ].join("\n"),
    },
  ])
}

export function createExtensionEidosFileViewTemplate(
  options: ExtensionEidosFileViewTemplateOptions
): ExtensionTemplate {
  assertPackageSegment(options.publisher, "Publisher")
  assertPackageSegment(options.name, "Extension name")
  if (typeof options.engineRange !== "string" || !options.engineRange.trim()) {
    throw new Error("Eidos engine range is required")
  }

  const canonicalId = `${options.publisher}.${options.name}`
  const displayName =
    options.displayName?.trim() || defaultDisplayName(options.name)
  const eidosFileViewId = `${canonicalId}.cards`
  const manifest: ExtensionManifestV1 = {
    $schema: "https://docs.eidos.space/schemas/extension-manifest.schema.json",
    manifestVersion: 1,
    publisher: options.publisher,
    name: options.name,
    displayName,
    description: `Render Eidos File records with the sandboxed ${displayName} layout.`,
    version: "0.1.0",
    engines: { eidos: options.engineRange },
    entrypoints: { ui: "src/eidos-file-view.ts" },
    contributes: {
      eidosFileViews: [
        {
          id: eidosFileViewId,
          displayName,
          description: "A responsive, infinitely scrolling card view",
        },
      ],
    },
    permissions: {
      files: { read: ["**/*.eidos"], write: [] },
      network: [],
    },
  }

  return createTemplate(manifest, [
    {
      path: "src/eidos-file-view.ts",
      content: [
        'import type { ExtensionEidosFileViewContext } from "@eidos.space/extension-sdk"',
        "",
        'import "./eidos-file-view.css"',
        "",
        "export function activate(context: ExtensionEidosFileViewContext) {",
        `  console.info(${JSON.stringify(`${displayName} Eidos File view activated`)}, { viewId: context.viewId })`,
        '  const shell = document.createElement("main")',
        '  const header = document.createElement("header")',
        '  const title = document.createElement("strong")',
        '  const count = document.createElement("span")',
        '  const grid = document.createElement("section")',
        '  const sentinel = document.createElement("div")',
        '  shell.className = "eidos-file-view-shell"',
        '  grid.className = "record-grid"',
        '  sentinel.className = "sentinel"',
        "  header.append(title, count)",
        "  shell.append(header, grid, sentinel)",
        "  context.root.replaceChildren(shell)",
        "",
        "  let offset = 0",
        "  let loading = false",
        "  let complete = false",
        "  let generation = 0",
        "",
        "  function renderHeader() {",
        "    title.textContent = context.eidosFile.context.table.name",
        "    count.textContent = `${context.eidosFile.context.table.rowCount.toLocaleString()} records`",
        "  }",
        "",
        "  async function loadMore() {",
        "    if (loading || complete) return",
        "    loading = true",
        "    const requestGeneration = generation",
        '    sentinel.textContent = "Loading…"',
        "    try {",
        "      const page = await context.eidosFile.getPage({ offset, limit: 60 })",
        "      if (requestGeneration !== generation) return",
        '      const titleField = context.eidosFile.context.fields.find((field) => field.type === "title")?.columnName',
        "      for (const row of page.rows) {",
        '        const card = document.createElement("article")',
        '        const heading = document.createElement("strong")',
        '        const metadata = document.createElement("dl")',
        '        heading.textContent = String((titleField && row[titleField]) ?? row.title ?? "Untitled")',
        "        for (const field of context.eidosFile.context.fields.filter((field) => field.columnName !== titleField).slice(0, 4)) {",
        "          const value = row[field.columnName]",
        '          if (value === null || value === undefined || value === "") continue',
        '          const term = document.createElement("dt")',
        '          const detail = document.createElement("dd")',
        "          term.textContent = field.name",
        "          detail.textContent = String(value)",
        "          metadata.append(term, detail)",
        "        }",
        "        card.append(heading, metadata)",
        "        grid.append(card)",
        "      }",
        "      offset += page.rows.length",
        "      complete = offset >= page.total || page.rows.length === 0",
        '      sentinel.textContent = complete ? `${page.total.toLocaleString()} records` : "Scroll for more"',
        "    } catch (error) {",
        '      sentinel.textContent = error instanceof Error ? error.message : "Unable to load records"',
        "    } finally {",
        "      loading = false",
        "    }",
        "  }",
        "",
        "  function reset() {",
        "    generation += 1",
        "    offset = 0",
        "    complete = false",
        "    grid.replaceChildren()",
        "    renderHeader()",
        "    void loadMore()",
        "  }",
        "",
        "  const observer = new IntersectionObserver((entries) => {",
        "    if (entries.some((entry) => entry.isIntersecting)) void loadMore()",
        '  }, { rootMargin: "320px" })',
        "  observer.observe(sentinel)",
        "  context.subscriptions.add(context.eidosFile.onDidChangeContext(reset))",
        "  reset()",
        "",
        "  return {",
        "    dispose() {",
        "      observer.disconnect()",
        "      context.root.replaceChildren()",
        "    },",
        "  }",
        "}",
        "",
      ].join("\n"),
    },
    {
      path: "src/eidos-file-view.css",
      content: [
        ":root { color: var(--eidos-color-foreground); background: var(--eidos-color-background); font-family: var(--eidos-font-family); }",
        "* { box-sizing: border-box; }",
        "html, body { min-height: 100%; margin: 0; }",
        ".eidos-file-view-shell { padding: 20px; }",
        "header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 16px; }",
        "header strong { font-size: 18px; }",
        "header span, .sentinel { color: var(--eidos-color-muted-foreground); font-size: 12px; }",
        ".record-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }",
        "article { min-width: 0; padding: 14px; border: 1px solid var(--eidos-color-border); border-radius: 10px; background: var(--eidos-color-background); }",
        "article > strong { display: block; overflow: hidden; margin-bottom: 12px; text-overflow: ellipsis; white-space: nowrap; }",
        "dl { display: grid; grid-template-columns: minmax(0, .7fr) minmax(0, 1fr); gap: 6px 10px; margin: 0; font-size: 12px; }",
        "dt { overflow: hidden; color: var(--eidos-color-muted-foreground); text-overflow: ellipsis; white-space: nowrap; }",
        "dd { overflow: hidden; margin: 0; text-overflow: ellipsis; white-space: nowrap; }",
        ".sentinel { display: grid; min-height: 72px; place-items: center; }",
        "",
      ].join("\n"),
    },
    {
      path: "README.md",
      content: [
        `# ${displayName}`,
        "",
        `This extension contributes the \`${eidosFileViewId}\` layout to the Eidos File view picker.`,
        "",
        "Create a view in any `.eidos` file, select this extension layout, and scroll to load records in bounded pages.",
        "",
        "Run `eidos-extension check .` before installing this package into a Space.",
        "",
      ].join("\n"),
    },
  ])
}

export function createExtensionTextEditorTemplate(
  options: ExtensionTextEditorTemplateOptions
): ExtensionTemplate {
  assertPackageSegment(options.publisher, "Publisher")
  assertPackageSegment(options.name, "Extension name")
  if (typeof options.engineRange !== "string" || !options.engineRange.trim()) {
    throw new Error("Eidos engine range is required")
  }

  const canonicalId = `${options.publisher}.${options.name}`
  const displayName =
    options.displayName?.trim() || defaultDisplayName(options.name)
  const editorId = `${canonicalId}.editor`
  const filenamePattern = options.filenamePattern?.trim() || "**/*.notes.md"
  const mediaType = options.mediaType?.trim() || "text/markdown"
  const manifest: ExtensionManifestV1 = {
    $schema: "https://docs.eidos.space/schemas/extension-manifest.schema.json",
    manifestVersion: 1,
    publisher: options.publisher,
    name: options.name,
    displayName,
    description: `Open matching text files with ${displayName}.`,
    version: "0.1.0",
    engines: { eidos: options.engineRange },
    entrypoints: { ui: "src/editor.ts" },
    contributes: {
      fileEditors: [
        {
          id: editorId,
          displayName,
          selector: [{ filenamePattern, mediaType }],
          priority: "option",
        },
      ],
    },
    permissions: {
      files: { read: [filenamePattern], write: [filenamePattern] },
      network: [],
    },
  }

  return createTemplate(manifest, [
    {
      path: "src/editor.ts",
      content: [
        'import type { ExtensionFileEditorContext } from "@eidos.space/extension-sdk"',
        "",
        'import "./editor.css"',
        "",
        "function minimalEdit(before: string, after: string) {",
        "  if (before === after) return undefined",
        "  let start = 0",
        "  while (start < before.length && start < after.length && before[start] === after[start]) start += 1",
        "  let beforeEnd = before.length",
        "  let afterEnd = after.length",
        "  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {",
        "    beforeEnd -= 1",
        "    afterEnd -= 1",
        "  }",
        "  return { start, end: beforeEnd, text: after.slice(start, afterEnd) }",
        "}",
        "",
        "export function activate(context: ExtensionFileEditorContext) {",
        `  console.info(${JSON.stringify(`${displayName} editor activated`)}, { path: context.document.snapshot.resource.path })`,
        '  const shell = document.createElement("main")',
        '  shell.className = "editor-shell"',
        '  const header = document.createElement("header")',
        '  const title = document.createElement("strong")',
        '  title.textContent = context.document.snapshot.resource.path.split("/").at(-1) ?? "Text"',
        '  const status = document.createElement("span")',
        '  const textarea = document.createElement("textarea")',
        '  textarea.setAttribute("aria-label", "Document text")',
        "  header.append(title, status)",
        "  shell.append(header, textarea)",
        "  context.root.replaceChildren(shell)",
        "",
        "  let pendingText = context.document.snapshot.text",
        "  let applying = false",
        "",
        "  function renderState() {",
        "    const snapshot = context.document.snapshot",
        "    textarea.readOnly = snapshot.readOnly || !context.capabilities.editable",
        "    status.textContent = snapshot.externalConflict",
        '      ? "External change"',
        '      : textarea.readOnly ? "Read only" : snapshot.dirty ? "Unsaved" : "Saved"',
        "  }",
        "",
        "  async function flush() {",
        "    if (applying) return",
        "    applying = true",
        "    try {",
        "      while (pendingText !== context.document.snapshot.text) {",
        "        const edit = minimalEdit(context.document.snapshot.text, pendingText)",
        "        if (!edit) break",
        "        await context.document.applyEdits([edit])",
        "      }",
        "    } catch {",
        "      await context.document.resync()",
        "      pendingText = context.document.snapshot.text",
        "      textarea.value = pendingText",
        "    } finally {",
        "      applying = false",
        "      renderState()",
        "    }",
        "  }",
        "",
        "  textarea.value = pendingText",
        '  textarea.addEventListener("input", () => {',
        "    pendingText = textarea.value",
        "    void flush()",
        "  })",
        "  context.subscriptions.add(context.document.onDidChange(() => {",
        "    if (!applying) {",
        "      pendingText = context.document.snapshot.text",
        "      textarea.value = pendingText",
        "    }",
        "    renderState()",
        "  }))",
        "  context.subscriptions.add(context.document.onDidChangeState(renderState))",
        "  renderState()",
        "",
        "  return { dispose: () => context.root.replaceChildren() }",
        "}",
        "",
      ].join("\n"),
    },
    {
      path: "src/editor.css",
      content: [
        ":root {",
        "  color: var(--eidos-color-foreground);",
        "  background: var(--eidos-color-background);",
        "  font-family: var(--eidos-font-family);",
        "}",
        "",
        "* { box-sizing: border-box; }",
        "html, body { min-height: 100%; margin: 0; }",
        "",
        ".editor-shell {",
        "  display: grid;",
        "  grid-template-rows: auto minmax(0, 1fr);",
        "  min-height: 100vh;",
        "  padding: 24px;",
        "  gap: 12px;",
        "}",
        "",
        "header { display: flex; justify-content: space-between; gap: 16px; }",
        "header span { color: var(--eidos-color-muted-foreground); font-size: 12px; }",
        "textarea {",
        "  width: 100%;",
        "  min-height: 60vh;",
        "  resize: none;",
        "  border: 1px solid var(--eidos-color-border);",
        "  border-radius: 10px;",
        "  padding: 16px;",
        "  color: inherit;",
        "  background: var(--eidos-color-background);",
        "  font: 14px/1.6 ui-monospace, monospace;",
        "}",
        "textarea:focus-visible { outline: 2px solid var(--eidos-color-focus-ring); }",
        "",
      ].join("\n"),
    },
    {
      path: "README.md",
      content: [
        `# ${displayName}`,
        "",
        `This extension contributes the \`${editorId}\` text editor for \`${filenamePattern}\`.`,
        "",
        "Run `eidos-extension check .` before installing this package into a Space.",
        "",
      ].join("\n"),
    },
  ])
}
