import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const files = {
  app: "apps/cli/src/app.rs",
  cargo: "apps/cli/Cargo.toml",
  cargoLock: "apps/cli/Cargo.lock",
  liteWorkflow: ".github/workflows/build-and-release-eidos-lite.yml",
  latest: "apps/cli/LATEST",
  releaseNotes: "apps/cli/RELEASE_NOTES.md",
  releaseWorkflow: ".github/workflows/build-and-release-cli.yml",
  publishDockerfile: "apps/eidos-publish/container/Dockerfile",
  skillsModule: "apps/cli/src/skills.rs",
  skill: "skills/eidos/SKILL.md",
  skillCliReference: "skills/eidos/references/cli.md",
  skillOperationsReference: "skills/eidos/references/operations.md",
  cliReadme: "apps/cli/README.md",
  windowsGateWorkflow: ".github/workflows/cli-windows-gates.yml",
  windowsSmoke: "apps/cli/windows-serve-smoke.ps1",
}

async function read(path) {
  return readFile(path, "utf8")
}

test("standalone CLI release owns its version and stable pointer", async () => {
  const [cargo, cargoLock, latest] = await Promise.all([
    read(files.cargo),
    read(files.cargoLock),
    read(files.latest),
  ])
  const version = cargo.match(/^version = "([^"]+)"$/mu)?.[1]
  const lockedVersion = cargoLock.match(
    /^name = "eidos"\nversion = "([^"]+)"$/mu
  )?.[1]

  assert.ok(version, "apps/cli/Cargo.toml must declare a package version")
  assert.match(
    version,
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
  )
  assert.equal(
    lockedVersion,
    version,
    "apps/cli/Cargo.lock must match the CLI package version"
  )
  if (!version.includes("-")) {
    assert.equal(
      latest.trim(),
      version,
      "stable CLI versions must match apps/cli/LATEST"
    )
  }
})

test("CLI workflow publishes the complete independent release contract", async () => {
  const [workflow, releaseNotes] = await Promise.all([
    read(files.releaseWorkflow),
    read(files.releaseNotes),
  ])
  const targets = [
    "aarch64-apple-darwin",
    "x86_64-apple-darwin",
    "x86_64-unknown-linux-gnu",
    "x86_64-pc-windows-msvc",
  ]

  assert.match(workflow, /tags:\s*\n\s*- ["']cli-v\*["']/u)
  for (const target of targets)
    assert.match(workflow, new RegExp(`target: ${target}`, "u"))
  assert.match(workflow, /apps\/cli\/install\.sh/u)
  assert.match(workflow, /apps\/cli\/install\.ps1/u)
  assert.match(workflow, /SHA256SUMS/u)
  assert.match(workflow, /make_latest: false/u)
  assert.match(workflow, /softprops\/action-gh-release@v2/u)
  assert.match(workflow, /generate_release_notes: false/u)
  assert.match(workflow, /body_path: apps\/cli\/RELEASE_NOTES\.md/u)
  assert.doesNotMatch(workflow, /generate_release_notes: true/u)
  assert.match(workflow, /audit-release-notes\.mjs/u)
  assert.match(workflow, /Verify published release notes/u)
  assert.match(
    releaseNotes,
    /https:\/\/download\.eidos\.space\/cli\/install\.sh/u
  )
  assert.match(
    workflow,
    /cargo run[\s\\]+--quiet[\s\\]+--locked[\s\\]+[\s\\]*--manifest-path apps\/cli\/Cargo\.toml[\s\\]+[\s\\]*--bin eidos -- skills init/u
  )
  assert.doesNotMatch(workflow, /npx(?: -y)? skills add/u)
  assert.match(workflow, /\.agents\/skills\/eidos\/SKILL\.md/u)
})

test("Windows builds include and smoke-test the embedded serve runtime", async () => {
  const [
    app,
    cargo,
    readme,
    releaseWorkflow,
    skillCliReference,
    windowsGate,
    windowsSmoke,
  ] = await Promise.all([
    read(files.app),
    read(files.cargo),
    read(files.cliReadme),
    read(files.releaseWorkflow),
    read(files.skillCliReference),
    read(files.windowsGateWorkflow),
    read(files.windowsSmoke),
  ])

  assert.match(cargo, /^qjs-host = \{ path = "qjs-host" \}$/mu)
  assert.doesNotMatch(cargo, /cfg\(not\(windows\)\)/u)
  assert.doesNotMatch(app, /cfg\((?:not\()?windows/u)
  assert.doesNotMatch(app, /serve is not supported on Windows/u)
  assert.doesNotMatch(readme, /serve` is not available on Windows/u)
  assert.doesNotMatch(skillCliReference, /Windows builds reject the command/u)
  assert.match(windowsSmoke, /Invoke-WebRequest/u)
  assert.match(windowsSmoke, /api\/manifest/u)
  assert.match(windowsGate, /runs-on: windows-latest/u)
  assert.match(windowsGate, /cargo test --workspace --locked/u)
  assert.match(windowsGate, /windows-serve-smoke\.ps1/u)
  assert.match(releaseWorkflow, /windows-serve-smoke\.ps1/u)
})

test("CLI release notes are versioned and scoped to the standalone CLI", async () => {
  const [cargo, releaseNotes] = await Promise.all([
    read(files.cargo),
    read(files.releaseNotes),
  ])
  const version = cargo.match(/^version = "([^"]+)"$/mu)?.[1]

  assert.ok(version)
  assert.match(releaseNotes, /^## What's new$/mu)
  assert.match(releaseNotes, /eidos skills init --global/u)
  assert.doesNotMatch(releaseNotes, /npx skills add/u)
  assert.match(releaseNotes, new RegExp(`select v${version}`, "u"))
  assert.doesNotMatch(releaseNotes, /github\.com\/mayneyao\/eidos\/compare\//u)
})

test("Serve release notes provide a complete runnable example", async () => {
  const releaseNotes = await read(files.releaseNotes)
  const firstCreateCommand = releaseNotes.search(/^eidos create /mu)
  const firstServeCommand = releaseNotes.search(/^eidos serve /mu)

  if (firstServeCommand === -1) return

  assert.notEqual(
    firstCreateCommand,
    -1,
    "Serve release notes must first show how to create an Eidos File"
  )
  assert.ok(
    firstCreateCommand < firstServeCommand,
    "Serve release notes must create the Eidos File before serving it"
  )
  assert.match(
    releaseNotes.slice(firstCreateCommand, firstServeCommand),
    /--table\s+\S+/u,
    "Serve release notes must create an initial table"
  )
})

test("public Eidos Skill stays complete and is bundled with every CLI build", async () => {
  const [
    cargo,
    latest,
    readme,
    skill,
    cliReference,
    operationsReference,
    skillsModule,
    publishDockerfile,
  ] = await Promise.all([
    read(files.cargo),
    read(files.latest),
    read(files.cliReadme),
    read(files.skill),
    read(files.skillCliReference),
    read(files.skillOperationsReference),
    read(files.skillsModule),
    read(files.publishDockerfile),
  ])
  const version = cargo.match(/^version = "([^"]+)"$/mu)?.[1]

  assert.equal(latest.trim(), version)
  assert.match(skill, /^---\nname: eidos\ndescription: .+\n---/u)
  assert.match(skill, /eidos --version/u)
  assert.match(skill, /references\/cli\.md/u)
  assert.match(skill, /references\/operations\.md/u)
  assert.ok(cliReference.trim().length > 0)
  assert.ok(operationsReference.trim().length > 0)
  assert.match(readme, /eidos skills init --global/u)
  assert.doesNotMatch(readme, /npx skills add/u)
  assert.match(
    skillsModule,
    /include_str!\("\.\.\/\.\.\/\.\.\/skills\/eidos\/SKILL\.md"\)/u
  )
  assert.match(skillsModule, /references\/cli\.md/u)
  assert.match(skillsModule, /references\/operations\.md/u)
  assert.match(
    publishDockerfile,
    /COPY skills\/eidos \/build\/skills\/eidos/u,
    "Publish Container must include the CLI's compile-time Skill resources"
  )
})

test("Eidos Lite releases do not rewrite the CLI version", async () => {
  const liteWorkflow = await read(files.liteWorkflow)
  assert.doesNotMatch(
    liteWorkflow,
    /(?:readFileSync|writeFileSync)\(['"]apps\/cli\/Cargo\.toml/u
  )
})

test("Eidos Lite publishes one audited release-note source", async () => {
  const liteWorkflow = await read(files.liteWorkflow)

  assert.match(liteWorkflow, /generate_release_notes: false/u)
  assert.match(
    liteWorkflow,
    /body_path: apps\/eidos-lite-desktop\/RELEASE_NOTES\.md/u
  )
  assert.doesNotMatch(liteWorkflow, /generate_release_notes: true/u)
  assert.match(liteWorkflow, /audit-release-notes\.mjs/u)
  assert.match(liteWorkflow, /Verify published release notes/u)
})

test("embedded Serve UI tracks every generated asset dependency", async () => {
  const uiRoot = "apps/cli/qjs-host/ui"
  const { stdout } = await execFileAsync("git", ["ls-files", "--", uiRoot])
  const trackedFiles = new Set(stdout.trim().split("\n").filter(Boolean))
  const sourceFiles = [...trackedFiles].filter((file) =>
    /\.(?:css|html|js)$/u.test(file)
  )
  const assetPattern =
    /["'`](\.\/[^"'`?#]+\.(?:css|ico|jpe?g|js|mjs|png|svg|wasm|woff2?)(?:\?[^"'`]*)?(?:#[^"'`]*)?)["'`]/gu

  assert.ok(trackedFiles.has(`${uiRoot}/index.html`))

  for (const sourceFile of sourceFiles) {
    const source = await read(sourceFile)
    for (const match of source.matchAll(assetPattern)) {
      const reference = match[1].split(/[?#]/u)[0]
      const dependency = path.posix.normalize(
        path.posix.join(path.posix.dirname(sourceFile), reference)
      )
      assert.ok(
        trackedFiles.has(dependency),
        `${sourceFile} references untracked Serve UI asset ${dependency}`
      )
    }
  }
})
