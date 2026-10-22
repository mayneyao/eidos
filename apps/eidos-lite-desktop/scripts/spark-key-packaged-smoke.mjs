// Run in Electron Node mode so fs reads the distributed ASAR; opens no window.
import fs from "node:fs"
import path from "node:path"
import { createPublicKey, verify } from "node:crypto"
import {
  resolveSparkPublicKey,
  verifySparkKeyArtifact,
} from "./spark-key-policy.mjs"

const [archive, environment, certificatePath] = process.argv.slice(2)
if (!archive || !environment)
  throw new Error("Pass app.asar and staging or production")
const output = path.join(path.resolve(archive), "dist-electron")
const expected = resolveSparkPublicKey(environment)
verifySparkKeyArtifact(
  JSON.parse(
    fs.readFileSync(path.join(output, "spark-key-build-policy.json"), "utf8")
  ),
  expected,
  fs
    .readdirSync(output)
    .filter((name) => name.endsWith(".js"))
    .map((name) => fs.readFileSync(path.join(output, name), "utf8"))
)
if (certificatePath) {
  const { payload, signature } = JSON.parse(
    fs.readFileSync(certificatePath, "utf8")
  )
  const key = createPublicKey({
    key: Buffer.from(expected.publicKey, "base64"),
    format: "der",
    type: "spki",
  })
  if (
    !verify(
      null,
      Buffer.from(JSON.stringify(payload)),
      key,
      Buffer.from(signature, "base64")
    )
  )
    throw new Error(
      "Certificate signature does not match the packaged Spark public key"
    )
  const issuer =
    environment === "staging"
      ? "https://staging.eidos.space"
      : "https://eidos.space"
  if (payload.issuer !== issuer || payload.audience !== "eidos-lite-spark")
    throw new Error("Certificate environment does not match this package")
  console.log(
    `Verified actual ${environment} certificate signature with packaged public key`
  )
}
console.log(
  `Verified packaged Spark ${environment} public key SHA-256: ${expected.sha256}`
)
