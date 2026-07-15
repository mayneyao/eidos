import { access, readFile, readdir } from "node:fs/promises"
import path from "node:path"

import {
  extensionIssuesUrl,
  extensionRegistryUrl,
  extensionRepositoryUrl,
  publicExtensionPackageDirectories,
} from "./file-extension-public-packages.mjs"

const packagesRoot = path.resolve("packages")
const entries = await readdir(packagesRoot, { withFileTypes: true })
const extensionPackageCandidates = entries
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("extension-"))
  .map((entry) => entry.name)
  .sort()
const extensionPackages = []
for (const directoryName of extensionPackageCandidates) {
  try {
    await access(path.join(packagesRoot, directoryName, "package.json"))
    extensionPackages.push(directoryName)
  } catch {
    // Some source-only compatibility directories are not publishable packages.
  }
}

if (extensionPackages.length === 0) {
  throw new Error("No extension packages were found")
}

for (const directoryName of extensionPackages) {
  const packageRoot = path.join(packagesRoot, directoryName)
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8")
  )
  const expectedHeading =
    manifest.license === "MIT"
      ? "MIT License"
      : manifest.license === "ISC"
        ? "ISC License"
        : undefined
  if (!expectedHeading) {
    throw new Error(
      `${manifest.name ?? directoryName} must declare the supported MIT or ISC license explicitly`
    )
  }
  let licenseText
  try {
    licenseText = await readFile(path.join(packageRoot, "LICENSE"), "utf8")
  } catch {
    throw new Error(
      `${manifest.name ?? directoryName} is missing a package-local LICENSE; npm would inherit the repository AGPL license`
    )
  }
  if (!licenseText.startsWith(expectedHeading)) {
    throw new Error(
      `${manifest.name ?? directoryName} declares ${manifest.license} but its LICENSE does not start with ${expectedHeading}`
    )
  }
  console.log(`Validated ${manifest.name} license (${manifest.license})`)

  if (!publicExtensionPackageDirectories.has(directoryName)) continue
  const expectedHomepage = `https://github.com/mayneyao/eidos/tree/main/packages/${directoryName}#readme`
  const failures = [
    [manifest.private === true, "must not be private"],
    [manifest.author !== "mayneyao", "must declare the package author"],
    [
      manifest.repository?.type !== "git" ||
        manifest.repository?.url !== extensionRepositoryUrl ||
        manifest.repository?.directory !== `packages/${directoryName}`,
      "must link to its exact monorepo directory",
    ],
    [manifest.homepage !== expectedHomepage, "must link to its package README"],
    [
      manifest.bugs?.url !== extensionIssuesUrl,
      "must link to the issue tracker",
    ],
    [
      manifest.publishConfig?.access !== "public" ||
        manifest.publishConfig?.registry !== extensionRegistryUrl,
      "must publish publicly to the npm registry",
    ],
    [
      !Array.isArray(manifest.files) ||
        !manifest.files.includes("dist") ||
        !manifest.files.includes("README.md"),
      "must ship dist and README.md",
    ],
    [
      manifest.scripts?.prepublishOnly !== "pnpm run build",
      "must rebuild before publishing",
    ],
  ].filter(([failed]) => failed)
  if (
    directoryName === "extension-cli" &&
    manifest.engines?.node !== ">=18.0.0"
  ) {
    failures.push([true, "must declare its supported Node.js runtime"])
  }
  if (failures.length > 0) {
    throw new Error(
      `${manifest.name} publish metadata is invalid: ${failures.map(([, message]) => message).join("; ")}`
    )
  }
  console.log(`Validated ${manifest.name} public publish metadata`)
}
