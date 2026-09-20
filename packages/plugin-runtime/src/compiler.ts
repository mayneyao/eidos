import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import type { CompilerOptions } from "typescript"
import type { Loader } from "esbuild"
import type {
  PluginIconDefinition,
  PluginManifest,
  PluginPackage,
} from "./contracts"
import { PluginError, PACKAGE_LIMIT } from "./errors"
import { parseManifest, record } from "./manifest"
import { parseJson } from "./json"
import { inlineManifest, validateSource } from "./source"
import { encodePackage } from "./package"
export { decodePackage } from "./package"
import { loadDependencyLock } from "./dependencies"
import { loadEsbuild, loadTypeScript } from "./toolchain"

export interface Diagnostic {
  code: string
  message: string
  file?: string
  line?: number
  column?: number
}
export class CompilationError extends PluginError {
  constructor(readonly diagnostics: Diagnostic[]) {
    super("SOURCE_INVALID", diagnostics.map((d) => d.message).join("\n"))
  }
}
export interface CompiledPlugin {
  program: PluginPackage
  bytes: Uint8Array
  revision: string
  dependencies: string[]
}
const supported = new Map<string, Loader>([
  [".ts", "ts"],
  [".tsx", "tsx"],
  [".js", "js"],
  [".mjs", "js"],
  [".jsx", "jsx"],
  [".css", "css"],
  [".png", "dataurl"],
  [".jpg", "dataurl"],
  [".jpeg", "dataurl"],
  [".webp", "dataurl"],
  [".gif", "dataurl"],
  [".svg", "dataurl"],
  [".woff2", "dataurl"],
  [".json", "json"],
])
const within = (root: string, file: string) => {
  const rel = path.relative(root, file)
  return (
    !path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${path.sep}`)
  )
}
const sdkPath = fileURLToPath(
  new URL(
    import.meta.url.endsWith(".ts")
      ? "../../plugin-sdk/src/index.ts"
      : "./contracts.ts",
    import.meta.url
  )
)

/** Trusted compiler: reads code as data, never imports a plugin or its config. */
export async function compilePlugin(input: string): Promise<CompiledPlugin> {
  const ts = loadTypeScript()
  const { build } = loadEsbuild()
  const requested = path.resolve(input)
  if ((await fs.lstat(requested)).isSymbolicLink())
    throw new PluginError("SOURCE_INVALID", "Source root cannot be a symlink")
  const absolute = await fs.realpath(requested)
  const single = (await fs.stat(absolute)).isFile()
  const root = await fs.realpath(single ? path.dirname(absolute) : absolute)
  const files = new Map<string, Buffer>()
  const read = async (file: string) => {
    const cached = files.get(file)
    if (cached) return cached
    if (
      within(root, file) &&
      !path.relative(root, file).split(path.sep).includes("node_modules")
    ) {
      let current = root
      for (const part of path.relative(root, file).split(path.sep)) {
        current = path.join(current, part)
        if ((await fs.lstat(current)).isSymbolicLink())
          throw new PluginError(
            "SOURCE_INVALID",
            "Source metadata symlinks are forbidden"
          )
      }
    }
    const value = await fs.readFile(file)
    if (value.length > PACKAGE_LIMIT)
      throw new PluginError("TOO_LARGE", "Source file exceeds 16 MiB")
    files.set(file, value)
    return value
  }
  const descriptor = path.join(root, "plugin.json")
  const hasDescriptor = await fs.access(descriptor).then(
    () => true,
    () => false
  )
  let raw: unknown
  if (single) {
    const source = ts.createSourceFile(
      absolute,
      (await read(absolute)).toString("utf8"),
      ts.ScriptTarget.Latest,
      true
    )
    raw = inlineManifest(source)
    if (hasDescriptor && raw !== undefined)
      throw new PluginError(
        "SOURCE_INVALID",
        "Both plugin.json and inline manifest were supplied"
      )
    if (raw === undefined && !hasDescriptor)
      throw new PluginError("SOURCE_INVALID", "Missing static manifest")
    if (raw !== undefined) {
      const m = record(raw)
      if (
        ((Array.isArray(m.actions) && m.actions.length) ||
          (Array.isArray(m.formatters) && m.formatters.length)) &&
        m.extension === undefined
      )
        m.extension = `./${path.basename(absolute)}`
    }
  }
  if (hasDescriptor) raw = parseJson((await read(descriptor)).toString("utf8"))
  const manifest = parseManifest(raw)
  const packageMetadata = path.join(root, "package.json")
  if (
    await fs.access(packageMetadata).then(
      () => true,
      () => false
    )
  )
    await read(packageMetadata)
  const entries = [
    ...new Set([
      ...(manifest.views ?? []).map((v) => v.entry),
      ...(manifest.extension ? [manifest.extension] : []),
    ]),
  ]
  const lock = await loadDependencyLock(root, read)
  const dependencyRoots = new Set<string>()
  const modules: Record<string, string> = Object.create(null)
  const sourceNames = new Set<string>()
  for (const entry of entries) {
    const result = await build({
      absWorkingDir: root,
      entryPoints: [path.join(root, entry)],
      outfile: "entry.js",
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
      define: { "process.env.NODE_ENV": '"production"' },
      splitting: false,
      logLevel: "silent",
      sourcemap: "inline",
      sourcesContent: false,
      tsconfigRaw: { compilerOptions: { jsx: "react-jsx", target: "ES2022" } },
      plugins: [
        {
          name: "eidos-source-policy",
          setup(builder) {
            builder.onResolve({ filter: /.*/ }, async (args) => {
              if (args.pluginData === "resolved") return
              if (
                args.kind === "url-token" &&
                /^data:(?:image\/(?:svg\+xml|png|jpeg|webp|gif)|font\/(?:woff2?|ttf))[;,]/i.test(
                  args.path
                )
              )
                return { path: args.path, external: true }
              if (
                args.kind !== "entry-point" &&
                (path.isAbsolute(args.path) ||
                  /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(args.path) ||
                  args.path.startsWith("//"))
              )
                throw new PluginError(
                  "SOURCE_INVALID",
                  "Absolute, remote and Node imports are forbidden"
                )
              const bare =
                args.kind !== "entry-point" && !args.path.startsWith(".")
              if (bare && !lock)
                throw new PluginError(
                  "DEPENDENCY_MISSING",
                  "Install and lock dependencies before loading"
                )
              const resolved = await builder.resolve(args.path, {
                resolveDir: args.resolveDir || root,
                kind: args.kind,
                importer: args.importer,
                pluginData: "resolved",
              })
              if (resolved.errors.length || !resolved.path)
                throw new PluginError(
                  "DEPENDENCY_MISSING",
                  `Cannot resolve ${args.path}; install dependencies explicitly`
                )
              if (resolved.external)
                throw new PluginError(
                  "SOURCE_INVALID",
                  "External imports are forbidden"
                )
              const real = await fs.realpath(resolved.path)
              // pnpm store links inside this project's node_modules are allowed.
              if (bare) {
                const name = args.path.startsWith("@")
                  ? args.path.split("/").slice(0, 2).join("/")
                  : args.path.split("/")[0]
                dependencyRoots.add(await lock!.assertResolved(name, real))
              }
              const fromDependencies = [...dependencyRoots].some((directory) =>
                within(directory, args.importer)
              )
              if (
                !within(root, real) &&
                !bare &&
                !(
                  fromDependencies &&
                  [...dependencyRoots].some((directory) =>
                    within(directory, real)
                  )
                )
              )
                throw new PluginError(
                  "SOURCE_INVALID",
                  "Import escapes source root or approved dependencies"
                )
              if (
                within(root, resolved.path) &&
                !resolved.path.split(path.sep).includes("node_modules")
              ) {
                let current = root
                for (const part of path
                  .relative(root, resolved.path)
                  .split(path.sep)) {
                  current = path.join(current, part)
                  if ((await fs.lstat(current)).isSymbolicLink())
                    throw new PluginError(
                      "SOURCE_INVALID",
                      "Source symlinks are forbidden"
                    )
                }
              }
              return { path: real }
            })
            builder.onLoad({ filter: /.*/ }, async (args) => {
              const loader = supported.get(path.extname(args.path))
              if (!loader)
                throw new PluginError(
                  "SOURCE_INVALID",
                  "Unsupported source module type"
                )
              const bytes = await read(args.path)
              if (["ts", "tsx", "js", "jsx"].includes(loader)) {
                const source = ts.createSourceFile(
                  args.path,
                  bytes.toString("utf8"),
                  ts.ScriptTarget.Latest,
                  true
                )
                validateSource(
                  source,
                  false,
                  args.path.split(path.sep).includes("node_modules")
                )
                if (!args.path.split(path.sep).includes("node_modules")) {
                  sourceNames.add(args.path)
                  if (hasDescriptor && inlineManifest(source) !== undefined)
                    throw new PluginError(
                      "SOURCE_INVALID",
                      "Both descriptor forms were supplied"
                    )
                }
              }
              return { contents: bytes, loader }
            })
          },
        },
      ],
    })
    let code = result.outputFiles.find((f) => f.path.endsWith(".js"))?.text
    if (!code)
      throw new PluginError("SOURCE_INVALID", "Compiler emitted no JavaScript")
    const css = result.outputFiles.find((f) => f.path.endsWith(".css"))?.text
    if (css)
      code = `const style = document.createElement('style'); style.textContent = ${JSON.stringify(css)}; document.head.append(style);\n${code}`
    modules[entry] = code
  }
  const options: CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    allowJs: true,
    checkJs: true,
    types: [],
    baseUrl: root,
    paths: { "@eidos.space/plugin-sdk": [sdkPath] },
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  }
  const host = ts.createCompilerHost(options)
  const originalRead = host.readFile.bind(host)
  host.readFile = (file) => {
    const cached = files.get(file)
    if (cached) return cached.toString("utf8")
    const contents = originalRead(file)
    if (contents !== undefined && within(root, file))
      files.set(file, Buffer.from(contents))
    return contents
  }
  options.allowImportingTsExtensions = true
  const checks = new Map<string, string>()
  for (const [index, entry] of entries.entries()) {
    const expected = manifest.extension === entry ? "Activate" : "Mount"
    checks.set(
      path.join(root, `__eidos_entry_check_${index}.ts`),
      `import implementation from ${JSON.stringify(entry)}; import type { ${expected} } from '@eidos.space/plugin-sdk'; const checked: ${expected} = implementation;`
    )
  }
  const originalSource = host.getSourceFile.bind(host)
  const originalExists = host.fileExists.bind(host)
  host.fileExists = (file) => checks.has(file) || originalExists(file)
  host.getSourceFile = (file, language, onError, shouldCreate) =>
    checks.has(file)
      ? ts.createSourceFile(file, checks.get(file)!, language, true)
      : originalSource(file, language, onError, shouldCreate)
  const program = ts.createProgram(
    [...sourceNames, ...checks.keys()],
    options,
    host
  )
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.category === ts.DiagnosticCategory.Error)
    .map((d) => {
      const position =
        d.file && d.start !== undefined
          ? d.file.getLineAndCharacterOfPosition(d.start)
          : undefined
      return {
        code: `TS${d.code}`,
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
        ...(d.file
          ? {
              file: within(root, d.file.fileName)
                ? path.relative(root, d.file.fileName)
                : path.basename(d.file.fileName),
            }
          : {}),
        ...(position
          ? { line: position.line + 1, column: position.character + 1 }
          : {}),
      }
    })
  if (diagnostics.length) throw new CompilationError(diagnostics)
  // Reject a mixed revision; no caller receives a candidate assembled from changes.
  for (const [file, bytes] of files)
    if (!(await fs.readFile(file)).equals(bytes))
      throw new PluginError(
        "STALE_REVISION",
        "Source changed during compilation; retry"
      )
  const inlineIcon = async (
    icon: PluginIconDefinition | undefined
  ): Promise<PluginIconDefinition | undefined> => {
    if (!icon) return icon
    const iconTarget =
      typeof icon === "string" && !icon.startsWith("data:")
        ? icon
        : typeof icon === "object" &&
            "file" in icon &&
            typeof icon.file === "string" &&
            !icon.file.startsWith("data:")
          ? icon.file
          : typeof icon === "object" &&
              "src" in icon &&
              typeof icon.src === "string" &&
              !icon.src.startsWith("data:")
            ? icon.src
            : null

    if (!iconTarget) return icon
    const iconPath = path.resolve(root, iconTarget)
    if (!within(root, iconPath) && iconPath !== root) {
      throw new PluginError("SOURCE_INVALID", "Icon file outside plugin root")
    }
    const iconBytes = await read(iconPath)
    if (iconBytes.length > 512 * 1024) {
      throw new PluginError("TOO_LARGE", "Icon file exceeds 512 KiB")
    }
    const ext = path.extname(iconPath).toLowerCase()
    const mime =
      ext === ".svg"
        ? "image/svg+xml"
        : ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".gif"
              ? "image/gif"
              : "image/jpeg"
    const dataUrl = `data:${mime};base64,${iconBytes.toString("base64")}`
    return { src: dataUrl }
  }

  const finalIcon = await inlineIcon(manifest.icon)
  const finalViews = manifest.views
    ? await Promise.all(
        manifest.views.map(async (v) => ({
          ...v,
          ...(v.icon !== undefined ? { icon: await inlineIcon(v.icon) } : {}),
        }))
      )
    : undefined
  const finalActions = manifest.actions
    ? await Promise.all(
        manifest.actions.map(async (a) => ({
          ...a,
          ...(a.icon !== undefined ? { icon: await inlineIcon(a.icon) } : {}),
        }))
      )
    : undefined

  const finalManifest: PluginManifest = {
    ...manifest,
    ...(finalIcon !== undefined ? { icon: finalIcon } : {}),
    ...(finalViews !== undefined ? { views: finalViews } : {}),
    ...(finalActions !== undefined ? { actions: finalActions } : {}),
  }

  const hash = createHash("sha256")
    .update("eidos-source-1\0")
    .update(JSON.stringify(finalManifest))
    .update(ts.version)
  for (const [file, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b)))
    hash
      .update(path.relative(root, file))
      .update("\0")
      .update(bytes)
      .update("\0")
  for (const [entry, code] of Object.entries(modules))
    hash.update(entry).update(code)
  const bytes = encodePackage(finalManifest, modules)
  return {
    program: { format: 1, manifest: finalManifest, modules },
    bytes,
    revision: hash.digest("hex"),
    dependencies: [...files.keys()],
  }
}
