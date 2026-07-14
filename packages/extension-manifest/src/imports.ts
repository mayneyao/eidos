import path from "node:path"
import { parseSync } from "oxc-parser"
import type { ExtensionDiagnostic } from "./types"

const SDK_MODULE = "@eidos.space/extension-sdk"
const MODULE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".mjs",
  ".json",
  ".css",
] as const

interface ImportReference {
  specifier?: string
  dynamic: boolean
  offset?: number
  length?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function numberProperty(
  value: Record<string, unknown>,
  key: string
): number | undefined {
  return typeof value[key] === "number" ? value[key] : undefined
}

function literalString(value: unknown): string | undefined {
  if (!isRecord(value) || value.type !== "Literal") return undefined
  return typeof value.value === "string" ? value.value : undefined
}

function collectImportReferences(program: unknown): {
  imports: ImportReference[]
  requireCalls: Array<{ offset?: number; length?: number }>
} {
  const imports: ImportReference[] = []
  const requireCalls: Array<{ offset?: number; length?: number }> = []
  const stack: unknown[] = [program]
  const visited = new Set<object>()

  while (stack.length > 0) {
    const node = stack.pop()
    if (Array.isArray(node)) {
      for (let index = node.length - 1; index >= 0; index -= 1) {
        stack.push(node[index])
      }
      continue
    }
    if (!isRecord(node) || visited.has(node)) continue
    visited.add(node)

    const start = numberProperty(node, "start")
    const end = numberProperty(node, "end")
    const location = {
      offset: start,
      length:
        start !== undefined && end !== undefined ? end - start : undefined,
    }

    if (
      node.type === "ImportDeclaration" ||
      node.type === "ExportAllDeclaration" ||
      node.type === "ExportNamedDeclaration"
    ) {
      const specifier = literalString(node.source)
      if (specifier !== undefined) {
        imports.push({ specifier, dynamic: false, ...location })
      }
    } else if (node.type === "ImportExpression") {
      imports.push({
        specifier: literalString(node.source),
        dynamic: true,
        ...location,
      })
    } else if (node.type === "CallExpression") {
      const callee = node.callee
      if (
        isRecord(callee) &&
        callee.type === "Identifier" &&
        callee.name === "require"
      ) {
        requireCalls.push(location)
      }
    }

    for (const [key, child] of Object.entries(node)) {
      if (
        key === "type" ||
        key === "start" ||
        key === "end" ||
        key === "span" ||
        key === "parent"
      ) {
        continue
      }
      if (Array.isArray(child) || isRecord(child)) stack.push(child)
    }
  }

  return { imports, requireCalls }
}

function moduleCandidates(base: string): string[] {
  const extension = path.posix.extname(base)
  if (extension) {
    const candidates = [base]
    if (extension === ".js" || extension === ".mjs") {
      const stem = base.slice(0, -extension.length)
      candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.mts`)
    } else if (extension === ".jsx") {
      candidates.push(`${base.slice(0, -extension.length)}.tsx`)
    }
    return candidates
  }
  return [
    ...MODULE_EXTENSIONS.map((candidate) => `${base}${candidate}`),
    ...MODULE_EXTENSIONS.map((candidate) => `${base}/index${candidate}`),
  ]
}

function resolveRelativeImport(
  importer: string,
  specifier: string,
  availablePaths: ReadonlySet<string>
): string | undefined {
  if (
    specifier.includes("\0") ||
    specifier.includes("\\") ||
    specifier.includes("?") ||
    specifier.includes("#")
  ) {
    return undefined
  }
  const target = path.posix.normalize(
    path.posix.join(path.posix.dirname(importer), specifier)
  )
  if (
    target === ".." ||
    target.startsWith("../") ||
    path.posix.isAbsolute(target) ||
    target === "extension.lock.json"
  ) {
    return undefined
  }
  return moduleCandidates(target).find((candidate) =>
    availablePaths.has(candidate)
  )
}

export function analyzeExtensionModuleImports(
  filePath: string,
  source: string,
  availablePaths: ReadonlySet<string>
): ExtensionDiagnostic[] {
  const parsed = parseSync(filePath, source)
  if (parsed.errors.length > 0) {
    return parsed.errors.map((error) => {
      const firstLabel = error.labels?.[0]
      return {
        code: "package-import-syntax",
        severity: "error",
        message: `Cannot parse ${filePath}: ${error.message}`,
        path: filePath,
        offset: firstLabel?.start,
        length:
          firstLabel?.start !== undefined && firstLabel?.end !== undefined
            ? firstLabel.end - firstLabel.start
            : undefined,
      }
    })
  }

  const diagnostics: ExtensionDiagnostic[] = []
  const references = collectImportReferences(parsed.program)
  for (const call of references.requireCalls) {
    diagnostics.push({
      code: "package-import-unsupported",
      severity: "error",
      message: "CommonJS require() is not supported in extension packages",
      path: filePath,
      ...call,
    })
  }

  for (const reference of references.imports) {
    if (reference.dynamic && reference.specifier === undefined) {
      diagnostics.push({
        code: "package-import-unsupported",
        severity: "error",
        message: "Dynamic import() must use one string literal",
        path: filePath,
        offset: reference.offset,
        length: reference.length,
      })
      continue
    }
    const specifier = reference.specifier
    if (!specifier) continue
    if (specifier === SDK_MODULE) continue
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
      diagnostics.push({
        code: "package-import-unsupported",
        severity: "error",
        message: `Unsupported bare, built-in, or remote import: ${specifier}`,
        path: filePath,
        offset: reference.offset,
        length: reference.length,
      })
      continue
    }
    const resolved = resolveRelativeImport(filePath, specifier, availablePaths)
    if (!resolved) {
      diagnostics.push({
        code: "package-import-missing",
        severity: "error",
        message: `Relative import does not resolve inside the package: ${specifier}`,
        path: filePath,
        offset: reference.offset,
        length: reference.length,
      })
    }
  }

  return diagnostics
}
