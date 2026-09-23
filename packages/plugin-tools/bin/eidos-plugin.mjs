#!/usr/bin/env node
import fs from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { compilePlugin, checkPluginCompatibility } from "../dist/compiler.js"
const templates = fileURLToPath(new URL("../templates/", import.meta.url))
export const templateCatalog = JSON.parse(
  await fs.readFile(path.join(templates, "catalog.json"), "utf8")
)
export async function create(directory, template = "document-view") {
  if (!Object.hasOwn(templateCatalog, template))
    throw Error(
      "Unknown template: " +
        template +
        ". Choose " +
        Object.keys(templateCatalog).join(", ")
    )
  const name = path.basename(path.resolve(directory))
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    throw Error("Choose a lowercase project name")
  const definition = templateCatalog[template]
  const project = JSON.parse(
    await fs.readFile(path.join(templates, "project.json"), "utf8")
  )
  const manifest = {
    apiVersion: 1,
    id: `local.${name}`,
    name,
    version: "0.1.0",
    ...definition.manifest,
  }
  const pkg = {
    name,
    ...project.package,
    scripts: { ...project.package.scripts, ...definition.scripts },
  }
  await fs.mkdir(directory)
  for (const [file, value] of [
    ["plugin.json", manifest],
    ["package.json", pkg],
    ["tsconfig.json", project.tsconfig],
  ])
    await fs.writeFile(
      path.join(directory, file),
      JSON.stringify(value, null, 2) + "\n"
    )
  for (const [destination, source] of Object.entries(definition.files)) {
    await fs.mkdir(path.dirname(path.join(directory, destination)), {
      recursive: true,
    })
    await fs.copyFile(
      path.join(templates, source),
      path.join(directory, destination)
    )
  }
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
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      template: { type: "string" },
      target: { type: "string" },
      out: { type: "string" },
      repo: { type: "string" },
      category: { type: "string" },
      description: { type: "string" },
      compatibility: { type: "string" },
    },
  })
  const [command, input] = positionals
  if (values.help) {
    console.log(
      "eidos-plugin create <directory> [--template " +
        Object.keys(templateCatalog).join("|") +
        "]\neidos-plugin check [source] [--target lite|cli] [--json]\neidos-plugin pack [source] [--out file] [--json]\neidos-plugin registry <package> --repo owner/repo --category category --description text --compatibility text [--json]\neidos-plugin templates [--json]"
    )
    return
  }
  const allowed = {
    create: ["template"],
    check: ["target"],
    pack: ["out"],
    registry: ["repo", "category", "description", "compatibility"],
    templates: [],
    dev: [],
  }
  if (!Object.hasOwn(allowed, command))
    throw Error("Unknown command. Run eidos-plugin --help")
  if (positionals.length > (command === "templates" ? 1 : 2))
    throw Error("Unexpected positional arguments")
  for (const key of Object.keys(values))
    if (!["json", "help", ...allowed[command]].includes(key))
      throw Error("--" + key + " is not supported by " + command)
  if (values.target && !["lite", "cli"].includes(values.target))
    throw Error("--target must be lite or cli")
  if (["create", "registry"].includes(command) && !input)
    throw Error(
      "Specify a " + (command === "create" ? "project directory" : "package")
    )
  const source = path.resolve(input ?? ".")
  let value, human
  if (command === "templates") {
    value = {
      templates: Object.entries(templateCatalog).map(([id, t]) => ({
        id,
        description: t.description,
      })),
    }
    human = value.templates.map((t) => t.id + ": " + t.description).join("\n")
  } else if (command === "create") {
    const template = values.template ?? "document-view"
    await create(source, template)
    value = { directory: source, template }
    human = `Created ${source} (${template}). Run npm install, npm run check, then load plugin.json in Lite.`
  } else if (command === "check") {
    const manifest = await check(source)
    const compatibility = {
      lite: checkPluginCompatibility(manifest, "eidos-lite"),
      cli: checkPluginCompatibility(manifest, "eidos-cli"),
    }
    value = { manifest, compatibility }
    human =
      "Plugin source and types checked\n" +
      Object.entries(compatibility)
        .map(
          ([host, result]) =>
            host +
            ": " +
            (result.compatible ? "compatible" : result.message) +
            (result.missingFeatures.length
              ? " Missing: " + result.missingFeatures.join(", ")
              : "")
        )
        .join("\n") +
      "\nHost support is based on this tool version; use eidos plugin doctor <package> for the installed CLI."
    if (values.target && !compatibility[values.target].compatible) {
      process.exitCode = 1
      value.error = {
        code: "HOST_INCOMPATIBLE",
        message: compatibility[values.target].message,
      }
    }
  } else if (command === "pack") {
    const output = await pack(source, values.out)
    const bytes = await fs.readFile(output)
    const checksum = output + ".sha256"
    await fs.writeFile(
      checksum,
      createHash("sha256").update(bytes).digest("hex") +
        "  " +
        path.basename(output) +
        "\n"
    )
    value = { output, checksum }
    human = output + "\nChecksum: " + checksum
  } else if (command === "registry") {
    const { decodePackage } = await import("../dist/compiler.js")
    const bytes = await fs.readFile(source)
    const { manifest } = decodePackage(bytes)
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(
        values.repo ?? ""
      )
    )
      throw Error("--repo must be owner/repo")
    const categories = [
      "data-visualization",
      "knowledge-and-writing",
      "productivity",
      "automation",
      "integrations",
      "developer-tools",
      "other",
    ]
    if (!categories.includes(values.category))
      throw Error("--category must be " + categories.join(", "))
    for (const key of ["description", "compatibility"])
      if (
        !values[key]?.trim() ||
        values[key].length > 1024 ||
        /[\u0000-\u001f]/u.test(values[key])
      )
        throw Error(
          "--" + key + " must be 1–1024 characters without control characters"
        )
    const entry = {
      id: manifest.id,
      name: manifest.name,
      description: values.description,
      category: values.category,
      repo: values.repo,
      version: manifest.version,
      tag: "v" + manifest.version,
      asset: path.basename(source),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      preview: false,
      compatibility: values.compatibility,
    }
    if (!/^[a-z0-9.-]+\.eidos-plugin$/.test(entry.asset))
      throw Error("Use a lowercase .eidos-plugin asset filename")
    value = { entry }
    human = JSON.stringify(entry, null, 2)
  } else
    throw Error(
      "CLI authoring connection is not available yet. In Lite, use Load development source to load plugin.json or a single TS file."
    )
  console.log(
    values.json
      ? JSON.stringify({ schemaVersion: 1, command, ...value })
      : human
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
