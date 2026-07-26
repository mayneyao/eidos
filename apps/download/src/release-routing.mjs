const CLI_SOURCE_BASE =
  "https://raw.githubusercontent.com/mayneyao/eidos/dev/apps/cli"

const cliSources = Object.freeze({
  "/cli/install.ps1": `${CLI_SOURCE_BASE}/install.ps1`,
  "/cli/install.sh": `${CLI_SOURCE_BASE}/install.sh`,
  "/cli/latest": `${CLI_SOURCE_BASE}/LATEST`,
})

export function getCliSource(pathname) {
  return cliSources[pathname] ?? null
}

export function isStableDesktopRelease(release) {
  return (
    release?.draft === false &&
    release?.prerelease === false &&
    /^v\d/u.test(release?.tag_name ?? "")
  )
}
