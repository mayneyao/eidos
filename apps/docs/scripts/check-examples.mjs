import { access, cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import Ajv2020 from "ajv/dist/2020.js"
import {
  compileExtensionSurface,
  compileExtensionWorker,
} from "@eidos.space/extension-runtime/compiler"
import { inspectExtensionPackage } from "@eidos.space/extension-manifest/node"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repositoryRoot = resolve(root, "../..")
const examplesRoot = join(root, "examples")
const exampleNames = await readdir(examplesRoot)
const packageSchemaPath = join(
  repositoryRoot,
  "packages/extension-manifest/schema/extension-manifest.schema.json"
)
const publicSchemaPath = join(
  root,
  "public/schemas/extension-manifest.schema.json"
)
const [packageSchemaText, publicSchemaText] = await Promise.all([
  readFile(packageSchemaPath, "utf8"),
  readFile(publicSchemaPath, "utf8"),
])
if (packageSchemaText !== publicSchemaText) {
  throw new Error(
    "Public extension manifest schema is out of sync with @eidos.space/extension-manifest"
  )
}
const schema = JSON.parse(packageSchemaText)
const validateManifest = new Ajv2020({
  allErrors: true,
  formats: {
    uri: (value) => {
      try {
        new URL(value)
        return true
      } catch {
        return false
      }
    },
  },
  strict: true,
}).compile(schema)

async function collectPackageFiles(directory, relativeDirectory = "") {
  const files = []
  const entries = await readdir(join(directory, relativeDirectory), {
    withFileTypes: true,
  })
  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name
    if (entry.isDirectory()) {
      files.push(...(await collectPackageFiles(directory, relativePath)))
    } else if (entry.isFile()) {
      files.push({
        path: relativePath,
        content: await readFile(join(directory, relativePath)),
      })
    }
  }
  return files
}

for (const exampleName of exampleNames) {
  const exampleRoot = join(examplesRoot, exampleName)
  const manifestPath = join(exampleRoot, "extension.json")
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))

  const fail = (message) => {
    throw new Error(`${exampleName}: ${message}`)
  }

  if (!validateManifest(manifest)) {
    fail(
      `manifest does not match the public schema:\n${validateManifest.errors
        .map((error) => `  ${error.instancePath || "/"} ${error.message}`)
        .join("\n")}`
    )
  }

  const extensionId = `${manifest.publisher}.${manifest.name}`
  const commands = manifest.contributes?.commands ?? []
  const fileEditors = manifest.contributes?.fileEditors ?? []

  if (commands.length === 0 && fileEditors.length === 0) {
    fail("at least one command or file editor is required")
  }

  for (const command of commands) {
    if (!command.id.startsWith(`${extensionId}.`)) {
      fail(`command ${command.id} must start with ${extensionId}.`)
    }
  }

  for (const editor of fileEditors) {
    if (!editor.id.startsWith(`${extensionId}.`)) {
      fail(`file editor ${editor.id} must start with ${extensionId}.`)
    }
  }

  for (const items of Object.values(manifest.contributes?.menus ?? {})) {
    for (const item of items) {
      if (!commands.some((command) => command.id === item.command)) {
        fail(`menu references unknown command ${item.command}`)
      }
    }
  }

  for (const entrypoint of Object.values(manifest.entrypoints ?? {})) {
    if (entrypoint.startsWith("/") || entrypoint.split("/").includes("..")) {
      fail(`entrypoint ${entrypoint} escapes the package`)
    }
    await access(join(exampleRoot, entrypoint))
  }

  const packageFiles = await collectPackageFiles(exampleRoot)
  const compiled = []
  if (manifest.entrypoints?.worker) {
    compiled.push(
      await compileExtensionWorker({
        entrypoint: manifest.entrypoints.worker,
        files: packageFiles,
      })
    )
  }
  if (manifest.entrypoints?.ui) {
    compiled.push(
      await compileExtensionSurface({
        entrypoint: manifest.entrypoints.ui,
        files: packageFiles,
      })
    )
  }
  const warnings = compiled.flatMap((bundle) => bundle.warnings)
  if (warnings.length > 0) {
    fail(
      `compiler warnings:\n${warnings.map((warning) => `  ${warning}`).join("\n")}`
    )
  }

  const inspectionRoot = await mkdtemp(join(tmpdir(), "eidos-docs-extension-"))
  try {
    const installedRoot = join(inspectionRoot, extensionId)
    await cp(exampleRoot, installedRoot, { recursive: true })
    const inspection = await inspectExtensionPackage(installedRoot, {
      hostVersion: "0.33.0",
    })
    if (inspection.status !== "ready") {
      fail(
        `package inspector rejected the installable source:\n${inspection.diagnostics
          .map(
            (diagnostic) =>
              `  ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`
          )
          .join("\n")}`
      )
    }
  } finally {
    await rm(inspectionRoot, { recursive: true, force: true })
  }

  console.log(`Validated ${extensionId}`)
}
