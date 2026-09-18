#!/usr/bin/env node
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { compilePlugin } from "../dist/compiler.js"
const templates = fileURLToPath(new URL("../templates/", import.meta.url))
export async function create(directory) {
  const name = path.basename(path.resolve(directory))
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    throw Error("Choose a lowercase project name")
  await fs.mkdir(directory)
  await fs.mkdir(path.join(directory, "src"))
  const manifest = {
    apiVersion: 1,
    id: `local.${name}`,
    name,
    version: "0.1.0",
    views: [
      {
        id: "table",
        title: "CSV Table",
        entry: "./src/main.ts",
        context: "document",
        access: "write",
      },
    ],
    placements: [
      { location: "file/open", view: "table", extensions: [".csv"] },
    ],
  }
  const pkg = {
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      check: "eidos-plugin check .",
      "pack:plugin": "eidos-plugin pack .",
    },
    devDependencies: {
      "@eidos.space/plugin-sdk": "^0.1.0",
      "@eidos.space/plugin-tools": "^0.1.0",
    },
  }
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      lib: ["ES2022", "DOM"],
      strict: true,
      skipLibCheck: true,
      noEmit: true,
    },
    include: ["src"],
  }
  for (const [file, value] of [
    ["plugin.json", manifest],
    ["package.json", pkg],
    ["tsconfig.json", tsconfig],
  ])
    await fs.writeFile(
      path.join(directory, file),
      JSON.stringify(value, null, 2) + "\n"
    )
  for (const file of ["main.ts", "csv.ts", "style.css"])
    await fs.copyFile(
      path.join(templates, `${file}.txt`),
      path.join(directory, "src", file)
    )
  await fs.writeFile(
    path.join(directory, ".gitignore"),
    "node_modules/\ndist/\n"
  )
  await fs.copyFile(
    path.join(templates, "README.md"),
    path.join(directory, "README.md")
  )
}
export async function check(source) {
  return (await compilePlugin(source)).program.manifest
}
export async function pack(source, output) {
  const compiled = await compilePlugin(source)
  const root = (await fs.stat(source)).isDirectory()
    ? source
    : path.dirname(source)
  const target = output
    ? path.resolve(output)
    : path.join(
        root,
        "dist",
        `${compiled.program.manifest.id}-${compiled.program.manifest.version}.eidos-plugin`
      )
  await fs.mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  try {
    await fs.writeFile(temporary, compiled.bytes)
    await fs.rename(temporary, target)
  } finally {
    await fs.rm(temporary, { force: true })
  }
  return target
}
export async function run(argv) {
  const json = argv.includes("--json")
  const args = argv.filter((arg) => arg !== "--json")
  const [command, input = "."] = args
  const source = path.resolve(input)
  let value
  if (command === "create") {
    if (args.length < 2) throw Error("Specify a project directory")
    await create(source)
    value = { directory: source }
  } else if (command === "check") value = { manifest: await check(source) }
  else if (command === "pack") {
    const index = args.indexOf("--out")
    if (index >= 0 && !args[index + 1]) throw Error("--out requires a path")
    value = {
      output: await pack(source, index >= 0 ? args[index + 1] : undefined),
    }
  } else if (command === "dev")
    throw Error(
      "CLI authoring connection is not available yet. In Lite, use Load development source to load plugin.json or a single TS file."
    )
  else
    throw Error(
      "Usage: eidos plugin <create|check|pack> [source] [--out file] [--json]"
    )
  console.log(
    json
      ? JSON.stringify({ schemaVersion: 1, command, ...value })
      : (value.output ??
          (command === "check"
            ? "Plugin source and types checked"
            : `Created ${source}`))
  )
}
const invoked = process.argv[1]
  ? await fs.realpath(process.argv[1]).catch(() => null)
  : null
if (invoked === fileURLToPath(import.meta.url))
  run(process.argv.slice(2)).catch((error) => {
    if (process.argv.includes("--json"))
      console.log(
        JSON.stringify({
          schemaVersion: 1,
          error: {
            code: error.code ?? "SOURCE_INVALID",
            message: error.message,
            diagnostics: error.diagnostics ?? [],
          },
        })
      )
    else console.error(error.message)
    process.exitCode = 1
  })
