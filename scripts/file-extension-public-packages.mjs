export const extensionRepositoryUrl =
  "git+https://github.com/mayneyao/eidos.git"
export const extensionIssuesUrl = "https://github.com/mayneyao/eidos/issues"
export const extensionRegistryUrl = "https://registry.npmjs.org/"

export const publicExtensionPackages = Object.freeze([
  Object.freeze({
    name: "@eidos.space/extension-manifest",
    directory: "extension-manifest",
    archive: "extension-manifest.tgz",
  }),
  Object.freeze({
    name: "@eidos.space/extension-surface-protocol",
    directory: "extension-surface-protocol",
    archive: "extension-surface-protocol.tgz",
  }),
  Object.freeze({
    name: "@eidos.space/extension-sdk",
    directory: "extension-sdk",
    archive: "extension-sdk.tgz",
  }),
  Object.freeze({
    name: "@eidos.space/extension-runtime",
    directory: "extension-runtime",
    archive: "extension-runtime.tgz",
  }),
  Object.freeze({
    name: "@eidos.space/extension-cli",
    directory: "extension-cli",
    archive: "extension-cli.tgz",
  }),
])

export const publicExtensionPackageDirectories = new Set(
  publicExtensionPackages.map(({ directory }) => directory)
)
