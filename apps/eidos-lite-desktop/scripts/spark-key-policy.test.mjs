import assert from "node:assert/strict"
import { generateKeyPairSync, sign, verify, createPublicKey } from "node:crypto"
import test from "node:test"
import {
  resolveSparkPublicKey,
  validateSparkPublicKey,
  verifySparkKeyArtifact,
} from "./spark-key-policy.mjs"

function keyPair(type = "ed25519") {
  const pair = generateKeyPairSync(type)
  return {
    ...pair,
    encoded: pair.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64"),
  }
}

test("staging has a valid public pin and production requires an explicit key", () => {
  assert.equal(resolveSparkPublicKey("staging", {}).environment, "staging")
  assert.throws(() => resolveSparkPublicKey("production", {}), /required/)
  assert.throws(
    () =>
      resolveSparkPublicKey("production", {
        EIDOS_LITE_SPARK_PUBLIC_KEY_PRODUCTION: "",
      }),
    /required/
  )
  assert.throws(() => resolveSparkPublicKey("typo", {}), /environment/)
})

test("malformed, private and wrong-algorithm keys are rejected", () => {
  for (const value of [
    "",
    "not a key",
    "AAAA",
    keyPair("ed448").encoded,
    keyPair()
      .privateKey.export({ type: "pkcs8", format: "der" })
      .toString("base64"),
  ])
    assert.throws(() => validateSparkPublicKey(value))
})

test("production cannot reuse either the pinned or overridden staging key", () => {
  const staging = resolveSparkPublicKey("staging", {}).publicKey
  const custom = keyPair().encoded
  assert.throws(
    () =>
      resolveSparkPublicKey("production", {
        EIDOS_LITE_SPARK_PUBLIC_KEY_PRODUCTION: staging,
      }),
    /differ/
  )
  assert.throws(
    () =>
      resolveSparkPublicKey("production", {
        EIDOS_LITE_SPARK_PUBLIC_KEY_PRODUCTION: custom,
        EIDOS_LITE_SPARK_PUBLIC_KEY_STAGING: custom,
      }),
    /differ/
  )
  assert.doesNotThrow(() =>
    resolveSparkPublicKey("production", {
      EIDOS_LITE_SPARK_PUBLIC_KEY_PRODUCTION: custom,
    })
  )
})

test("artifact must embed the same public key, environment and fingerprint", () => {
  const expected = resolveSparkPublicKey("staging", {})
  assert.doesNotThrow(() =>
    verifySparkKeyArtifact(expected, expected, [
      `const key = '${expected.publicKey}'`,
    ])
  )
  assert.throws(
    () =>
      verifySparkKeyArtifact(
        { ...expected, environment: "production" },
        expected,
        [expected.publicKey]
      ),
    /manifest/
  )
  assert.throws(
    () =>
      verifySparkKeyArtifact({ ...expected, sha256: "wrong" }, expected, [
        expected.publicKey,
      ]),
    /manifest/
  )
  assert.throws(
    () => verifySparkKeyArtifact(expected, expected, ["const key = ''"]),
    /does not contain/
  )
})

test("public key from the build policy validates signed grants and rejects tampering", () => {
  const pair = keyPair()
  const build = resolveSparkPublicKey("staging", {
    EIDOS_LITE_SPARK_PUBLIC_KEY_STAGING: pair.encoded,
  })
  const payload = Buffer.from(
    JSON.stringify({ licenseId: 1, hardwareId: "test-device", expiresAt: null })
  )
  const signature = sign(null, payload, pair.privateKey)
  const key = createPublicKey({
    key: Buffer.from(build.publicKey, "base64"),
    format: "der",
    type: "spki",
  })
  assert.equal(verify(null, payload, key, signature), true)
  assert.equal(verify(null, Buffer.from("tampered"), key, signature), false)
  assert.equal(verify(null, payload, keyPair().publicKey, signature), false)
})
