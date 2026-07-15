import { readFile, readdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { checkExtensionPackage } from "@eidos.space/extension-cli"
import Ajv2020 from "ajv/dist/2020.js"

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

  const result = await checkExtensionPackage({
    packageRoot: exampleRoot,
    hostVersion: "0.33.0",
  })
  if (!result.ok) {
    fail(
      `developer check failed:\n${result.diagnostics
        .map((diagnostic) => {
          const location = diagnostic.path
            ? ` ${diagnostic.path}${diagnostic.line ? `:${diagnostic.line}:${diagnostic.column ?? 1}` : ""}`
            : ""
          return `  ${diagnostic.severity} ${diagnostic.code}${location}: ${diagnostic.message}`
        })
        .join("\n")}`
    )
  }

  console.log(`Validated ${result.canonicalId}`)
}
