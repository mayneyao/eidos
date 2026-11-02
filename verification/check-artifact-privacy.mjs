import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

// Only attest to absence; never echo a matched secret or file contents.
const needles = new Set()
for (const name of [
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "EIDOS_LITE_SPARK_TEST_CERTIFICATE",
]) {
  const value = process.env[name]
  if (value && value.length > 20) needles.add(value)
}
function certificateLeaves(value) {
  if (typeof value === "string" && value.length > 20) needles.add(value)
  else if (value && typeof value === "object")
    Object.values(value).forEach(certificateLeaves)
}
if (process.env.EIDOS_LITE_SPARK_TEST_CERTIFICATE)
  certificateLeaves(JSON.parse(process.env.EIDOS_LITE_SPARK_TEST_CERTIFICATE))
let files = 0
function visit(directory) {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    assert(!entry.isSymbolicLink(), "Artifact symlinks are forbidden")
    if (entry.isDirectory()) visit(file)
    else if (entry.isFile()) {
      const contents = fs.readFileSync(file)
      for (const needle of needles)
        assert(
          !contents.includes(Buffer.from(needle)),
          "Sensitive value found in artifact; upload blocked"
        )
      assert(
        !contents.includes(Buffer.from("PRIVATE KEY-----")),
        "Private key marker found; upload blocked"
      )
      files++
    }
  }
}
visit("candidate-evidence")
assert(files > 0, "No evidence to audit")
console.log(`Artifact privacy check passed for ${files} evidence files`)
