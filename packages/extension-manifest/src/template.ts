import { analyzeExtensionManifest } from "./manifest"
import type { ExtensionManifestV1 } from "./types"

const PACKAGE_SEGMENT_PATTERN = /^[a-z][a-z0-9-]{1,62}$/

export interface ExtensionCommandTemplateOptions {
  publisher: string
  name: string
  displayName?: string
  engineRange: string
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
    },
    permissions: {
      files: { read: [], write: [] },
      network: [],
    },
  }

  const analysis = analyzeExtensionManifest(JSON.stringify(manifest), {
    packageDirectoryName: canonicalId,
  })
  if (!analysis.valid) {
    throw new Error(
      `Generated extension template is invalid: ${analysis.diagnostics.map((item) => item.message).join("; ")}`
    )
  }

  const message = JSON.stringify(`Hello from ${displayName}`)
  return {
    canonicalId,
    manifest,
    files: [
      {
        path: "extension.json",
        content: `${JSON.stringify(manifest, null, 2)}\n`,
      },
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
          `This local extension contributes the \`${commandId}\` command.`,
          "",
          "Eidos currently validates this source without compiling or executing it.",
          "",
        ].join("\n"),
      },
    ],
  }
}
