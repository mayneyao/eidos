import {
  checkExtensionPackage,
  createExtensionProject,
  createLegacyPortingProject,
  type ExtensionProjectTemplate,
} from "./index"
import packageMetadata from "../package.json" with { type: "json" }

export interface ExtensionCliIo {
  stdout(message: string): void
  stderr(message: string): void
}

interface ParsedArguments {
  positional: string[]
  options: Map<string, string | true>
}

const HELP = `Eidos file-based extension developer tools

Usage:
  eidos-extension init <publisher.name> [options]
  eidos-extension port <archive-directory> --publisher <publisher> [options]
  eidos-extension check [package-directory] [options]

Commands:
  init    Create a command, panel, Eidos File view, or editable text-editor package without overwriting files
  port    Create a non-installable v1 porting workspace from a legacy source archive
  check   Run the same strict inspection and fixed compiler used by Eidos Desktop

Init options:
  --template <command|panel|eidos-file-view|text-editor>  Starter type (default: command)
  --out-dir <directory>             Parent directory (default: current directory)
  --display-name <name>             User-facing extension name
  --engine <range>                  Eidos engine range (default: >=0.33.0)
  --pattern <glob>                  Text-editor file pattern (default: **/*.notes.md)
  --media-type <type>               Text-editor media type (default: text/markdown)

Port options:
  --publisher <publisher>           Required v1 publisher ID
  --name <name>                     Override the name derived from the legacy slug
  --out-dir <directory>             Parent directory (default: current directory)
  --engine <range>                  Eidos engine range (default: >=0.33.0)
  --pattern <glob>                  Override the inferred file-editor selector
  --media-type <type>               File-editor media type (default: text/markdown)
  --json                            Print a machine-readable result

Check options:
  --host-version <version>          Verify engines.eidos compatibility
  --json                            Print a machine-readable result

General options:
  -h, --help                        Show help
  -v, --version                     Show CLI version
`

function parseArguments(args: string[]): ParsedArguments {
  const positional: string[] = []
  const options = new Map<string, string | true>()
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]!
    if (!value.startsWith("-")) {
      positional.push(value)
      continue
    }
    const key = value === "-h" ? "--help" : value === "-v" ? "--version" : value
    if (key === "--help" || key === "--version" || key === "--json") {
      options.set(key, true)
      continue
    }
    if (!key.startsWith("--")) throw new Error(`Unknown option: ${value}`)
    const optionValue = args[index + 1]
    if (!optionValue || optionValue.startsWith("-")) {
      throw new Error(`Option requires a value: ${value}`)
    }
    if (options.has(key)) throw new Error(`Option was provided twice: ${value}`)
    options.set(key, optionValue)
    index += 1
  }
  return { positional, options }
}

function option(parsed: ParsedArguments, name: string): string | undefined {
  const value = parsed.options.get(name)
  return typeof value === "string" ? value : undefined
}

function rejectUnknownOptions(
  parsed: ParsedArguments,
  allowed: readonly string[]
): void {
  const allowedSet = new Set(["--help", "--version", ...allowed])
  for (const key of parsed.options.keys()) {
    if (!allowedSet.has(key)) throw new Error(`Unknown option: ${key}`)
  }
}

function printDiagnostics(
  result: Awaited<ReturnType<typeof checkExtensionPackage>>,
  io: ExtensionCliIo
): void {
  const identity = result.canonicalId ?? result.packageRoot
  io.stdout(
    `${result.ok ? "✓" : "✗"} ${identity} · ${result.status}${result.version ? ` · v${result.version}` : ""}`
  )
  for (const entrypoint of result.entrypoints) {
    io.stdout(
      `  ✓ ${entrypoint.kind} ${entrypoint.path} (${entrypoint.bytes} bytes)`
    )
  }
  for (const diagnostic of result.diagnostics) {
    const location = diagnostic.path
      ? ` ${diagnostic.path}${diagnostic.line ? `:${diagnostic.line}:${diagnostic.column ?? 1}` : ""}`
      : ""
    io.stderr(
      `  ${diagnostic.severity === "error" ? "error" : "warning"} ${diagnostic.code}${location}: ${diagnostic.message}`
    )
  }
}

export async function runExtensionCli(
  args: string[],
  io: ExtensionCliIo = {
    stdout: (message) => console.log(message),
    stderr: (message) => console.error(message),
  }
): Promise<number> {
  try {
    if (args.length === 0) {
      io.stdout(HELP)
      return 0
    }
    const command = args[0]!
    const parsed = parseArguments(args.slice(1))
    if (
      command === "help" ||
      command === "--help" ||
      command === "-h" ||
      parsed.options.has("--help")
    ) {
      io.stdout(HELP)
      return 0
    }
    if (
      command === "--version" ||
      command === "-v" ||
      parsed.options.has("--version")
    ) {
      io.stdout(packageMetadata.version)
      return 0
    }

    if (command === "init") {
      rejectUnknownOptions(parsed, [
        "--template",
        "--out-dir",
        "--display-name",
        "--engine",
        "--pattern",
        "--media-type",
      ])
      if (parsed.positional.length !== 1) {
        throw new Error("init requires one <publisher.name> extension ID")
      }
      const template = option(parsed, "--template") ?? "command"
      if (
        template !== "command" &&
        template !== "panel" &&
        template !== "eidos-file-view" &&
        template !== "text-editor"
      ) {
        throw new Error(`Unknown extension template: ${template}`)
      }
      const created = await createExtensionProject({
        canonicalId: parsed.positional[0]!,
        template: template as ExtensionProjectTemplate,
        outDir: option(parsed, "--out-dir"),
        displayName: option(parsed, "--display-name"),
        engineRange: option(parsed, "--engine"),
        filenamePattern: option(parsed, "--pattern"),
        mediaType: option(parsed, "--media-type"),
      })
      io.stdout(`✓ Created ${created.canonicalId}`)
      io.stdout(`  ${created.packageRoot}`)
      io.stdout(
        "  Next: install dependencies in the project, then run npm run check"
      )
      return 0
    }

    if (command === "check") {
      rejectUnknownOptions(parsed, ["--host-version", "--json"])
      if (parsed.positional.length > 1) {
        throw new Error("check accepts at most one package directory")
      }
      const result = await checkExtensionPackage({
        packageRoot: parsed.positional[0] ?? ".",
        hostVersion: option(parsed, "--host-version"),
      })
      if (parsed.options.has("--json")) {
        io.stdout(JSON.stringify(result, null, 2))
      } else {
        printDiagnostics(result, io)
      }
      return result.ok ? 0 : 1
    }

    if (command === "port") {
      rejectUnknownOptions(parsed, [
        "--publisher",
        "--name",
        "--out-dir",
        "--engine",
        "--pattern",
        "--media-type",
        "--json",
      ])
      if (parsed.positional.length !== 1) {
        throw new Error("port requires one <archive-directory>")
      }
      const publisher = option(parsed, "--publisher")
      if (!publisher) throw new Error("port requires --publisher <publisher>")
      const result = await createLegacyPortingProject({
        archiveRoot: parsed.positional[0]!,
        publisher,
        name: option(parsed, "--name"),
        outDir: option(parsed, "--out-dir"),
        engineRange: option(parsed, "--engine"),
        filenamePattern: option(parsed, "--pattern"),
        mediaType: option(parsed, "--media-type"),
      })
      if (parsed.options.has("--json")) {
        io.stdout(JSON.stringify(result, null, 2))
      } else {
        io.stdout(`✓ Created porting workspace ${result.canonicalId}`)
        io.stdout(`  ${result.packageRoot}`)
        io.stdout(
          "  This draft is not installable. Review PORTING.md before renaming extension.json.draft."
        )
      }
      return 0
    }

    throw new Error(`Unknown command: ${command}`)
  } catch (error) {
    io.stderr(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    )
    return 2
  }
}
