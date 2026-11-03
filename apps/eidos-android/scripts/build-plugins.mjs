import {
  build,
  transform,
} from "../../../packages/plugin-runtime/node_modules/esbuild/lib/main.js"
import { readFile, mkdir, writeFile, readdir, copyFile } from "node:fs/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"

const root = fileURLToPath(new URL("..", import.meta.url))
// Use the canonical parser without executing plugin source during discovery.
const parser = await build({
  entryPoints: [path.join(root, "plugins/profile.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  banner: {
    js: `import { createRequire as createBuildRequire } from 'node:module'; const require = createBuildRequire(${JSON.stringify(fileURLToPath(import.meta.url))});`,
  },
})
// The canonical parser includes Node toolchains that resolve dependencies from import.meta.url.
const parserOutput = path.join(
  root,
  "../../packages/plugin-runtime/dist/android-host/profile.mjs"
)
await mkdir(path.dirname(parserOutput), { recursive: true })
await writeFile(parserOutput, parser.outputFiles[0].text)
const { validateAndroidManifest } = await import(pathToFileURL(parserOutput))

export { validateAndroidManifest }

export async function buildPlugins() {
  const output = path.join(root, "app/build/plugin-assets/plugins")
  await mkdir(output, { recursive: true })
  await build({
    entryPoints: [path.join(root, "plugins/package-validator.ts")],
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "AndroidPackageValidator",
    outfile: path.join(output, "validator.js"),
    minify: true,
    plugins: [
      {
        name: "browser-validation-toolchain",
        setup(build) {
          build.onResolve({ filter: /^\.\/toolchain$/ }, () => ({
            path: path.join(root, "plugins/validation-toolchain.ts"),
          }))
        },
      },
    ],
  })
  const catalog = []
  const ids = new Set()
  const compilerOutput = path.join(
    root,
    "../../packages/plugin-runtime/dist/android-host"
  )
  await mkdir(compilerOutput, { recursive: true })
  await build({
    entryPoints: [
      path.join(root, "../../packages/plugin-runtime/src/compiler.ts"),
    ],
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    outfile: path.join(compilerOutput, "compiler.js"),
  })
  await copyFile(
    path.join(root, "../../packages/plugin-sdk/src/index.ts"),
    path.join(compilerOutput, "contracts.ts")
  )
  const { compilePlugin } = await import(
    pathToFileURL(path.join(compilerOutput, "compiler.js"))
  )
  const sources = []
  for (const directory of await readdir(path.join(root, "plugins"), {
    withFileTypes: true,
  })) {
    if (!directory.isDirectory()) continue
    sources.push(path.join(root, "plugins", directory.name))
  }
  sources.push(
    ...(process.env.EIDOS_ANDROID_PLUGIN_SOURCES ?? "")
      .split(path.delimiter)
      .filter(Boolean)
  )
  for (const folder of sources) {
    validateAndroidManifest(
      JSON.parse(await readFile(path.join(folder, "plugin.json"), "utf8"))
    )
    const compiled = await compilePlugin(folder)
    const manifest = validateAndroidManifest(compiled.program.manifest)
    if (ids.has(manifest.id)) throw new Error("Duplicate plugin ID")
    ids.add(manifest.id)
    for (const view of manifest.views) {
      const asset = `${manifest.id}.${view.id}.js`
      const result = await transform(compiled.program.modules[view.entry], {
        format: "iife",
        globalName: "EidosPlugin",
      })
      await writeFile(path.join(output, asset), result.code)
      catalog.push({
        id: `${manifest.id}/${view.id}`,
        title: view.title,
        asset,
        revision: compiled.revision,
        document: view.capabilities?.includes("document") ?? false,
        workers: manifest.browser?.workers ?? false,
        networkOrigins: manifest.browser?.networkOrigins ?? [],
        extensions: [
          ...new Set(
            manifest.placements
              .filter((p) => p.view === view.id)
              .flatMap((p) => p.extensions)
          ),
        ],
      })
    }
  }
  const host = await build({
    entryPoints: [path.join(root, "plugins/host.js")],
    bundle: true,
    format: "iife",
    globalName: "EidosPluginHost",
    write: false,
  })
  await writeFile(path.join(output, "host.js"), host.outputFiles[0].text)
  await writeFile(path.join(output, "catalog.json"), JSON.stringify(catalog))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildPlugins()
