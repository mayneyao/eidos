import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const files = {
  cargo: "apps/cli/Cargo.toml",
  cargoLock: "apps/cli/Cargo.lock",
  desktopWorkflow: ".github/workflows/build-and-release-desktop-app.yml",
  latest: "apps/cli/LATEST",
  releaseWorkflow: ".github/workflows/build-and-release-cli.yml",
  skill: "skills/eidos/SKILL.md",
  skillCliReference: "skills/eidos/references/cli.md",
  skillOperationsReference: "skills/eidos/references/operations.md",
  cliReadme: "apps/cli/README.md",
  versionScript: "scripts/version.cjs",
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
  const workflow = await read(files.releaseWorkflow)
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
  assert.match(workflow, /https:\/\/download\.eidos\.space\/cli\/install\.sh/u)
  assert.match(workflow, /npx -y skills add/u)
  assert.match(workflow, /tree\/\$\{TAG\}\/skills\/eidos/u)
  assert.match(workflow, /\.agents\/skills\/eidos\/SKILL\.md/u)
})

test("public Eidos Skill stays complete and pinned to the stable CLI tag", async () => {
  const [cargo, latest, readme, skill, cliReference, operationsReference] =
    await Promise.all([
      read(files.cargo),
      read(files.latest),
      read(files.cliReadme),
      read(files.skill),
      read(files.skillCliReference),
      read(files.skillOperationsReference),
    ])
  const version = cargo.match(/^version = "([^"]+)"$/mu)?.[1]

  assert.equal(latest.trim(), version)
  assert.match(skill, /^---\nname: eidos\ndescription: .+\n---/u)
  assert.match(skill, /eidos --version/u)
  assert.match(skill, /references\/cli\.md/u)
  assert.match(skill, /references\/operations\.md/u)
  assert.ok(cliReference.trim().length > 0)
  assert.ok(operationsReference.trim().length > 0)
  assert.match(
    readme,
    new RegExp(`tree/cli-v${version}/skills/eidos`, "u"),
    "CLI README must install the Skill from the matching stable CLI tag"
  )
  assert.match(readme, /--skill eidos -g -a codex -y/u)
})

test("Desktop releases and app version bumps do not rewrite the CLI version", async () => {
  const [desktopWorkflow, versionScript] = await Promise.all([
    read(files.desktopWorkflow),
    read(files.versionScript),
  ])

  assert.doesNotMatch(
    desktopWorkflow,
    /(?:readFileSync|writeFileSync)\(['"]apps\/cli\/Cargo\.toml/u
  )
  assert.doesNotMatch(
    versionScript,
    /(?:readFileSync|writeFileSync|git add)\(?[`'"]apps\/cli\/Cargo\.toml/u
  )
})
