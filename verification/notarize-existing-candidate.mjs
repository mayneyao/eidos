// Notary-only: consumes exact accepted artifacts, never compiles or publishes.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { createHash, randomBytes } from "node:crypto"
import { spawnSync } from "node:child_process"

assert.equal(process.platform, "darwin")
const arch = process.argv[2]
assert(["arm64", "x64"].includes(arch))
const expected = {
  arm64: {
    zip: "04fb6da8313b23f462b4bf851f915258f1becd98be34437d8956e550f5677ee4",
    dmg: "bd7d33f75f7c4068cecb007181b3d5831e4f8b8a14df6b6fa978da1a86286b3f",
  },
  x64: {
    zip: "819b939b42d7d81ab4b75437818560806c386268a7385d6b717c4f76663a4274",
    dmg: "79bbe9506e4ec388817126f5d9a8f25ebb304db3ec62095729a28607ef696a62",
  },
}[arch]
const input = path.resolve("notary-input")
const evidence = path.resolve("notary-evidence", arch)
const output = path.resolve("notary-artifacts", arch)
fs.mkdirSync(evidence, { recursive: true })
fs.mkdirSync(output, { recursive: true })
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "lite-notary-only-"))
const keychain = path.join(temporary, "signing.keychain-db")
const privateValues = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID", "MACOS_CERTIFICATE", "MACOS_CERTIFICATE_PWD"].map(name => process.env[name]).filter(Boolean)
const redact = value => privateValues.reduce((text, secret) => text.split(secret).join("[redacted]"), String(value))
function write(name, value) {
  fs.writeFileSync(path.join(evidence, name), redact(typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n"))
}
function run(label, command, args, { retain = true, allowFailure = false } = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 20 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 })
  if (retain) write(label + ".log", result.stdout + result.stderr)
  if (result.status !== 0 && !allowFailure) throw new Error(`${label} failed (exit ${result.status}); see redacted evidence`)
  return { ...result, stdout: redact(result.stdout), stderr: redact(result.stderr) }
}
const sha = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex")
const identity = JSON.parse(fs.readFileSync(path.join(input, "candidate-evidence/installed-identities.json"), "utf8"))
const attestation = JSON.parse(fs.readFileSync(path.join(input, "candidate-evidence/input-attestation.json"), "utf8"))
const basename = extension => `Eidos Lite-0.30.0-rc.0-mac-${arch}.${extension}`
const original = extension => path.join(input, "apps/eidos-lite-desktop/dist-app", basename(extension))
const appIdentity = app => ({
  asar: sha(path.join(app, "Contents/Resources/app.asar")),
  native: sha(path.join(app, `Contents/Resources/app.asar.unpacked/node_modules/@eidos.space/graft-darwin-${arch}/graft-sdk.darwin-${arch}.node`)),
  cli: sha(path.join(app, "Contents/Resources/publish-engine/eidos")),
})
const record = { status: "running", arch, sourceRun: 41536366024, sourceHead: identity.source, runtimeSource: attestation.runtimeSource, ciHead: process.env.GITHUB_SHA, sourcePackagesUnchanged: true, compilationPerformed: false, applicationResigned: false, publicationPerformed: false, updateMetadataPublished: false, submissions: [] }
const save = () => write("result.json", record)
const credentialArgs = () => ["--apple-id", process.env.APPLE_ID, "--password", process.env.APPLE_APP_SPECIFIC_PASSWORD, "--team-id", process.env.APPLE_TEAM_ID]
function submit(label, file) {
  console.log(`Submitting ${label} for ${arch}; binary SHA-256 ${sha(file)}`)
  const result = run(label + "-submit", "xcrun", ["notarytool", "submit", file, ...credentialArgs(), "--output-format", "json", "--no-progress", "--wait", "--timeout", "15m"], { allowFailure: true })
  let response
  try { response = JSON.parse(result.stdout) } catch { throw new Error(`${label}: no JSON response, see redacted evidence`) }
  assert.match(response.id, /^[a-f0-9-]{36}$/i)
  const entry = { label, id: response.id, submittedSha256: sha(file), status: response.status }
  record.submissions.push(entry)
  save()
  if (response.status !== "Accepted") throw new Error(`${label}: Apple status ${response.status}; submission retained`)
  const log = run(label + "-apple-log", "xcrun", ["notarytool", "log", response.id, ...credentialArgs()])
  const parsed = JSON.parse(log.stdout)
  entry.issues = parsed.issues ?? []
  assert.equal(parsed.status, "Accepted")
  assert(!entry.issues.some(issue => issue.severity === "error"))
  save()
}
let mount
try {
  assert.equal(identity.source, "d7805bc7dae981a8e4f4b9cfabedea1b15a4267f")
  assert.equal(attestation.runtimeSource, "5038d986a16d3470ba5e8422bf2616f3086326d6")
  for (const name of ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID", "MACOS_CERTIFICATE", "MACOS_CERTIFICATE_PWD"]) assert(process.env[name], `Missing existing credential ${name}`)
  for (const extension of ["zip", "dmg"]) assert.equal(sha(original(extension)), expected[extension])
  record.originalSha256 = expected
  const extracted = path.join(temporary, "original-zip")
  run("extract-original-zip", "ditto", ["-x", "-k", original("zip"), extracted])
  const app = path.join(extracted, "Eidos Lite.app")
  record.originalApp = appIdentity(app)
  assert.deepEqual(record.originalApp, { asar: identity.archiveSha256, native: identity.native.sha256, cli: identity.bundledCli.sha256 })
  run("original-app-signature", "codesign", ["--verify", "--deep", "--strict", "--verbose=2", app])
  const detail = run("original-app-signature-details", "codesign", ["--display", "--verbose=4", app])
  assert.match(detail.stderr, /Developer ID Application/)
  assert.match(detail.stderr, /runtime/)
  save()

  // ZIP is submitted byte-for-byte. Apple requires stapling its app, then re-zipping.
  submit("zip", original("zip"))
  run("zip-app-staple", "xcrun", ["stapler", "staple", app])
  run("zip-app-staple-validate", "xcrun", ["stapler", "validate", app])
  run("zip-app-signature", "codesign", ["--verify", "--deep", "--strict", "--verbose=2", app])
  const zipGate = run("zip-app-gatekeeper", "spctl", ["--assess", "--type", "execute", "--verbose=4", app])
  assert.match(zipGate.stderr + zipGate.stdout, /Notarized Developer ID/)
  assert.deepEqual(appIdentity(app), record.originalApp)
  const zip = path.join(output, basename("zip"))
  run("archive-stapled-app", "ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, zip])

  // The accepted builder DMG has a signed app but an unsigned disk-image shell.
  // Sign only a copy of that shell using the existing Developer ID identity.
  // Preserve the original bytes/identity and do not recompile or re-sign the app.
  const dmg = path.join(output, basename("dmg"))
  fs.copyFileSync(original("dmg"), dmg)
  const beforeDmgSignature = run("original-dmg-signature", "codesign", ["--verify", "--verbose=2", dmg], { allowFailure: true })
  record.originalDmgShellSigned = beforeDmgSignature.status === 0
  if (!record.originalDmgShellSigned) {
    const cert = path.join(temporary, "identity.p12")
    const encoded = process.env.MACOS_CERTIFICATE.replace(/^data:[^,]*;base64,/, "")
    assert(/^[A-Za-z0-9+/=\s]+$/.test(encoded), "Existing certificate is not inline base64; no remote credential fetch permitted")
    fs.writeFileSync(cert, Buffer.from(encoded, "base64"), { mode: 0o600 })
    const password = randomBytes(32).toString("hex")
    privateValues.push(password)
    run("keychain-create", "security", ["create-keychain", "-p", password, keychain], { retain: false })
    run("keychain-unlock", "security", ["unlock-keychain", "-p", password, keychain], { retain: false })
    run("keychain-import", "security", ["import", cert, "-k", keychain, "-P", process.env.MACOS_CERTIFICATE_PWD, "-T", "/usr/bin/codesign"], { retain: false })
    run("keychain-partitions", "security", ["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", password, keychain], { retain: false })
    const found = run("keychain-identity", "security", ["find-identity", "-v", "-p", "codesigning", keychain], { retain: false })
    const signer = found.stdout.match(/([A-F0-9]{40}) "Developer ID Application:[^"\n]+"/)
    assert(signer, "Existing Developer ID signing identity unavailable")
    run("dmg-shell-sign", "codesign", ["--sign", signer[1], "--keychain", keychain, "--timestamp", dmg])
  }
  run("signed-dmg-signature", "codesign", ["--verify", "--verbose=2", dmg])
  record.dmgSubmittedAfterContainerSigning = sha(dmg)
  submit("dmg", dmg)
  run("dmg-staple", "xcrun", ["stapler", "staple", dmg])
  run("dmg-staple-validate", "xcrun", ["stapler", "validate", dmg])
  run("stapled-dmg-signature", "codesign", ["--verify", "--verbose=2", dmg])
  const dmgGate = run("dmg-gatekeeper", "spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=4", dmg])
  assert.match(dmgGate.stderr + dmgGate.stdout, /Notarized Developer ID/)
  mount = path.join(temporary, "mounted")
  fs.mkdirSync(mount)
  run("dmg-mount", "hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, dmg])
  const dmgApp = path.join(mount, "Eidos Lite.app")
  assert.deepEqual(appIdentity(dmgApp), record.originalApp)
  run("dmg-inner-app-signature", "codesign", ["--verify", "--deep", "--strict", "--verbose=2", dmgApp])
  const appGate = run("dmg-inner-app-gatekeeper", "spctl", ["--assess", "--type", "execute", "--verbose=4", dmgApp])
  assert.match(appGate.stderr + appGate.stdout, /Notarized Developer ID/)
  run("dmg-unmount", "hdiutil", ["detach", mount])
  mount = undefined

  const check = path.join(temporary, "rezipped")
  run("extract-final-zip", "ditto", ["-x", "-k", zip, check])
  const finalApp = path.join(check, "Eidos Lite.app")
  run("final-zip-ticket", "xcrun", ["stapler", "validate", finalApp])
  assert.deepEqual(appIdentity(finalApp), record.originalApp)
  run("final-zip-signature", "codesign", ["--verify", "--deep", "--strict", "--verbose=2", finalApp])
  record.outputFiles = [dmg, zip].map(file => ({ name: path.basename(file), bytes: fs.statSync(file).size, sha256: sha(file), sha512: createHash("sha512").update(fs.readFileSync(file)).digest("base64") }))
  fs.writeFileSync(path.join(output, "SHA256SUMS.json"), JSON.stringify(record.outputFiles, null, 2) + "\n")
  record.gatekeeper = { zipApplication: "Notarized Developer ID", dmgContainer: "Notarized Developer ID", dmgInnerApplication: "Notarized Developer ID" }
  record.ticket = { dmgStapled: true, zipApplicationStapled: true, zipContainerStaplingSupported: false }
  record.updateMetadata = "Prior updater hashes/blockmaps describe original accepted inputs; notary outputs have separate manifest and are not published update assets"
  record.status = "passed"
} catch (error) {
  record.status = "failed"
  record.error = redact(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  if (mount) run("cleanup-unmount", "hdiutil", ["detach", mount], { allowFailure: true })
  if (fs.existsSync(keychain)) run("cleanup-keychain", "security", ["delete-keychain", keychain], { retain: false, allowFailure: true })
  fs.rmSync(temporary, { recursive: true, force: true })
  record.privateTemporaryFilesRemoved = !fs.existsSync(temporary)
  save()
  // Scan only retained text. Public signing team IDs legitimately occur in binaries.
  for (const entry of fs.readdirSync(evidence)) {
    const contents = fs.readFileSync(path.join(evidence, entry), "utf8")
    for (const value of privateValues) assert(!contents.includes(value), "Sensitive value retained; upload blocked")
    assert(!contents.includes("PRIVATE KEY-----"), "Private key marker retained")
  }
  fs.writeFileSync(path.join(evidence, "privacy-passed"), "No credential values or private-key markers in retained text; private keychain removed.\n")
  console.log(JSON.stringify({ status: record.status, arch, submissions: record.submissions.map(({ id, status }) => ({ id, status })), privateTemporaryFilesRemoved: record.privateTemporaryFilesRemoved }))
}
