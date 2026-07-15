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
        "      async () => {",
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
