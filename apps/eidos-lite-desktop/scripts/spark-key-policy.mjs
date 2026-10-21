import { createHash, createPublicKey } from "node:crypto"
import { readFileSync } from "node:fs"

const pins = JSON.parse(
  readFileSync(new URL("../spark-public-keys.json", import.meta.url), "utf8")
)

export function validateSparkPublicKey(value) {
  if (typeof value !== "string" || !value)
    throw new Error(
      "Spark public key is required; configure the environment public key before building"
    )
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw new Error("Spark public key must be base64 SPKI DER")
  const bytes = Buffer.from(value, "base64")
  if (bytes.toString("base64") !== value)
    throw new Error("Spark public key must be canonical base64 SPKI DER")
  const key = createPublicKey({ key: bytes, format: "der", type: "spki" })
  if (key.asymmetricKeyType !== "ed25519")
    throw new Error("Spark public key must use Ed25519")
  if (!key.export({ format: "der", type: "spki" }).equals(bytes))
    throw new Error("Spark public key contains noncanonical DER")
  return {
    publicKey: value,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }
}

export function resolveSparkPublicKey(environment, env = process.env) {
  if (!["staging", "production"].includes(environment))
    throw new Error("Spark environment must be staging or production")
  const name = `EIDOS_LITE_SPARK_PUBLIC_KEY_${environment.toUpperCase()}`
  // Production builds must take the key from the release environment, never
  // silently from a committed pin. Staging may use its reviewed pin.
  const value =
    env[name] ?? (environment === "staging" ? pins[environment] : undefined)
  const result = validateSparkPublicKey(value)
  if (environment === "production") {
    const staging = validateSparkPublicKey(
      env.EIDOS_LITE_SPARK_PUBLIC_KEY_STAGING ?? pins.staging
    )
    const pinnedStaging = validateSparkPublicKey(pins.staging)
    if ([staging.sha256, pinnedStaging.sha256].includes(result.sha256))
      throw new Error(
        "Production Spark public key must differ from the staging key"
      )
  }
  return { environment, ...result }
}

export function verifySparkKeyArtifact(manifest, expected, sources) {
  if (JSON.stringify(manifest) !== JSON.stringify(expected))
    throw new Error(
      "Spark key manifest does not match the expected environment and public key; rebuild before packaging"
    )
  if (!sources.some((source) => source.includes(expected.publicKey)))
    throw new Error(
      "Built Electron JavaScript does not contain the expected Spark public key"
    )
}
