// Bundled only by spark-local-integration.mjs; aliases resolve the sibling repo.
import assert from "node:assert/strict"
import { createHmac, generateKeyPairSync } from "node:crypto"
import { readFileSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import http from "node:http"
import { once } from "node:events"
// @ts-expect-error integration-only alias
import { handleCreemBillingWebhook } from "spark-webhook"
// @ts-expect-error integration-only alias
import { sparkRoute } from "spark-route"
// @ts-expect-error integration-only alias
import { POST as checkoutRoute } from "spark-checkout-route"
// @ts-expect-error integration-only alias
import {
  GET as accountSparkGet,
  POST as accountSparkRedeem,
} from "spark-account-route"
// @ts-expect-error integration-only alias
import { registerSyncDevice } from "spark-devices"
// @ts-expect-error integration-only alias
import { SqliteD1Database } from "spark-d1"
// @ts-expect-error integration-only alias
import { POST as legacyActivate } from "spark-legacy-activate"
// @ts-expect-error integration-only alias
import { POST as legacyValidate } from "spark-legacy-validate"
import { SparkService } from "../apps/eidos-lite-desktop/src/main/account/spark-service"
declare const __SPARK_ACCOUNT_ROOT__: string
const read = (file: string) =>
  readFileSync(path.join(__SPARK_ACCOUNT_ROOT__, file), "utf8")
const db =
  new SqliteD1Database(`CREATE TABLE user(id TEXT PRIMARY KEY, email TEXT);
  CREATE TABLE oauthAccessToken(id TEXT PRIMARY KEY, accessToken TEXT, accessTokenExpiresAt TEXT, userId TEXT, clientId TEXT);
  INSERT INTO user VALUES ('buyer','buyer@example.test'),('purchaser','purchaser@example.test');
  INSERT INTO oauthAccessToken VALUES ('token','fixture-access','2099-01-01 00:00:00','buyer','lite.desktop.eidos.space');
  ${read("db/license-system.sql")} ${read("db/eidos-cloud-billing.sql")} ${read("db/eidos-sync-devices.sql")}
  ${read("db/migrations/2026-10-19-spark-lite.sql")} ${read("db/migrations/2026-10-19-spark-cdk.sql")} ${read("db/migrations/2026-10-19-spark-personal-license.sql")} ${read("db/migrations/2026-10-19-spark-legacy-claim.sql")}`)
const keys = generateKeyPairSync("ed25519")
const hardwareId = "1f9a8b7c-6d5e-4f32-a109-876543210abc"
const env = {
  DB: db,
  EIDOS_ENVIRONMENT: "staging",
  CREEM_API_KEY: "creem_test_fixture",
  SPARK_CDK_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  CREEM_WEBHOOK_SECRET: "fixture-secret",
  CREEM_CREDIT_PRODUCTS_JSON: "{}",
  CREEM_SYNC_PRODUCTS_JSON: "{}",
  CREEM_PUBLISH_PRODUCTS_JSON: "{}",
  EIDOS_SPARK_TEST_PRODUCT_JSON: JSON.stringify({
    productId: "prod_sparktest",
    maxActivations: 3,
    offlineLeaseSeconds: 3600,
    offlinePolicy: "perpetual",
  }),
  LICENSE_PRIVATE_KEY: keys.privateKey
    .export({ type: "pkcs8", format: "der" })
    .toString("base64"),
  BASE_URL: "",
  BETTER_AUTH_URL: "",
}
const server = http.createServer(async (incoming, outgoing) => {
  try {
    const chunks: Buffer[] = []
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk))
    const url = new URL(incoming.url!, env.BASE_URL)
    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers as Record<string, string>,
      ...(incoming.method === "POST" ? { body: Buffer.concat(chunks) } : {}),
    })
    const context = {
      request,
      url,
      locals: {
        runtime: { env },
        user:
          incoming.headers["x-test-user"] === "anonymous"
            ? null
            : incoming.headers["x-test-user"] === "purchaser"
              ? { id: "purchaser", email: "purchaser@example.test" }
              : { id: "buyer", email: "buyer@example.test" },
      },
    }
    let response: Response
    if (url.pathname === "/api/account/spark-checkout")
      response = await checkoutRoute(context)
    else if (url.pathname === "/api/account/spark")
      response =
        incoming.method === "POST"
          ? await accountSparkRedeem(context)
          : await accountSparkGet(context)
    else if (url.pathname === "/api/license/activate")
      response = await legacyActivate(context)
    else if (url.pathname === "/api/license/validate")
      response = await legacyValidate(context)
    else if (url.pathname === "/api/webhooks/creem")
      response = Response.json(await handleCreemBillingWebhook(request, env))
    else
      response = await sparkRoute(
        context,
        url.pathname.endsWith("activate")
          ? url.pathname.endsWith("deactivate")
            ? "deactivate"
            : "activate"
          : "status"
      )
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(await response.text())
  } catch (error) {
    outgoing.writeHead(500)
    outgoing.end(String(error))
  }
})
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "spark-client-"))
const realFetch = globalThis.fetch
let providerRequest: Record<string, unknown> | undefined
try {
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  assert(address && typeof address === "object")
  env.BASE_URL = env.BETTER_AUTH_URL = `http://127.0.0.1:${address.port}`
  await registerSyncDevice(db, "fixture-access", {
    stableDeviceId: hardwareId,
    displayName: "Spark fixture",
    platform: "macos",
  })
  globalThis.fetch = async (url, options) => {
    if (String(url) === "https://test-api.creem.io/v1/checkouts") {
      providerRequest = JSON.parse(String(options?.body))
      return Response.json({
        checkout_url: "https://test.creem.io/pay/fixture",
      })
    }
    // This harness fails if any unintended remote request is introduced.
    assert.equal(new URL(String(url)).origin, env.BASE_URL)
    return realFetch(url, options)
  }
  const forbiddenCheckout = await fetch(
    `${env.BASE_URL}/api/account/spark-checkout`,
    { method: "POST", headers: { Origin: "https://untrusted.example.test" } }
  )
  assert.equal(forbiddenCheckout.status, 403)
  assert.equal(db.get("SELECT COUNT(*) AS n FROM spark_checkout_intent").n, 0)
  assert.equal(
    (await fetch(`${env.BASE_URL}/api/spark/entitlements`)).status,
    401
  )
  const checkout = await fetch(`${env.BASE_URL}/api/account/spark-checkout`, {
    method: "POST",
    headers: { Origin: env.BASE_URL, "x-test-user": "purchaser" },
  })
  assert.equal(checkout.status, 200)
  assert.ok((await checkout.json()).checkoutUrl)
  assert.equal(db.get("SELECT COUNT(*) AS n FROM license").n, 0)
  const body = JSON.stringify({
    id: "evt_local",
    eventType: "checkout.completed",
    created_at: Date.now(),
    object: {
      id: "ch_local",
      status: "completed",
      mode: "test",
      product: { id: "prod_sparktest", billing_type: "onetime" },
      order: { id: "ord_local", status: "paid" },
      metadata: providerRequest!.metadata,
    },
  })
  const webhook = () =>
    fetch(`${env.BASE_URL}/api/webhooks/creem`, {
      method: "POST",
      body,
      headers: {
        "creem-signature": createHmac("sha256", env.CREEM_WEBHOOK_SECRET)
          .update(body)
          .digest("hex"),
      },
    })
  assert.equal((await (await webhook()).json()).applied, true)
  assert.equal((await (await webhook()).json()).applied, false)
  const license = db.get("SELECT id, userId FROM license")
  assert.equal(license.userId, null)
  const purchases = await (
    await fetch(`${env.BASE_URL}/api/account/spark`, {
      headers: { "x-test-user": "purchaser" },
    })
  ).json()
  const giftCode = purchases.purchases[0].code
  assert.ok(giftCode)
  const redeem = (user: string, code = giftCode, origin = env.BASE_URL) =>
    fetch(`${env.BASE_URL}/api/account/spark`, {
      method: "POST",
      headers: {
        "x-test-user": user,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
    })
  assert.equal((await redeem("anonymous")).status, 401)
  assert.equal(
    (await redeem("buyer", giftCode, "https://attacker.test")).status,
    403
  )
  assert.equal((await redeem("buyer", "x".repeat(5000))).status, 413)
  assert.equal((await redeem("buyer", "SPARK-wrong")).status, 409)
  const claim = await redeem("buyer")
  assert.equal(claim.status, 200)
  assert.equal(db.get("SELECT userId FROM license").userId, "buyer")
  assert.equal((await redeem("purchaser")).status, 409)
  assert.equal((await redeem("buyer")).status, 200)
  assert.deepEqual(
    (await (await fetch(`${env.BASE_URL}/api/account/spark`)).json()).purchases,
    []
  )
  const cachePath = path.join(dir, "spark.json")
  let signedIn = true
  const options = {
    origin: env.BASE_URL,
    publicKey: keys.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64"),
    cachePath,
    hardwareId: async () => hardwareId,
    account: async () =>
      signedIn ? { subject: "buyer", token: "fixture-access" } : null,
  }
  const lite = new SparkService(options)
  await assert.rejects(lite.require("file-metadata"), /Activate Spark/)
  const automatic = await lite.status(true)
  assert.equal(automatic.state, "active")
  assert.equal(automatic.perpetualOffline, true)
  assert.equal(automatic.licenses.length, 1)
  assert.equal(automatic.licenses[0].max_activations, 3)
  const owned = await (await fetch(`${env.BASE_URL}/api/account/spark`)).json()
  assert.equal(owned.devices.length, 1)
  const release = (user: string, origin = env.BASE_URL) =>
    fetch(`${env.BASE_URL}/api/account/spark`, {
      method: "POST",
      headers: {
        "x-test-user": user,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "release-device",
        activationId: owned.devices[0].id,
      }),
    })
  assert.equal((await release("anonymous")).status, 401)
  assert.equal((await release("buyer", "https://attacker.test")).status, 403)
  assert.equal((await release("purchaser")).status, 404)
  assert.equal((await release("buyer")).status, 200)
  assert.equal((await lite.status(true)).state, "inactive")
  assert.equal(
    (await lite.status(true)).state,
    "inactive",
    "released devices do not automatically reclaim seats"
  )
  assert.equal((await lite.activate(license.id)).state, "active")
  await lite.require("file-metadata")
  signedIn = false
  const restarted = new SparkService(options)
  assert.equal((await restarted.status(true)).state, "active")
  await restarted.require("file-metadata")
  signedIn = true
  await restarted.deactivate()
  await assert.rejects(restarted.require("file-metadata"), /Activate Spark/)
  assert.equal(
    db.get("SELECT activation_count FROM license").activation_count,
    0
  )
  assert.equal(db.get("SELECT COUNT(*) AS n FROM credit_account").n, 0)
  const legacyRequest = async (action: string, licenseKey: string) =>
    fetch(`${env.BASE_URL}/api/license/${action}`, {
      method: "POST",
      headers: {
        Authorization: "Bearer fixture-access",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ licenseKey, hardwareId }),
    })
  const newKey = db.get(
    "SELECT license_key FROM license WHERE plan = 'spark_lite_v1'"
  ).license_key
  assert.equal(
    (await (await legacyRequest("activate", newKey)).json()).success,
    false
  )
  assert.equal(
    (await (await legacyRequest("validate", newKey)).json()).valid,
    false
  )
  db.exec(`INSERT INTO license (provider, provider_order_id, license_key, plan, status, userId, max_activations,
    activation_count, issued_at, mode, rawData, createdAt, updatedAt) VALUES
    ('afdian','legacy_order','legacy_fixture','spark','pending','buyer',1,0,'2026-01-01T00:00:00Z','test','{}','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`)
  const oldActivated = await (
    await legacyRequest("activate", "legacy_fixture")
  ).json()
  assert.equal(oldActivated.success, true)
  assert.equal(oldActivated.license.plan, "spark")
  assert.equal(
    JSON.parse(oldActivated.certificate).payload.hardwareId,
    hardwareId
  )
  assert.equal(
    (await (await legacyRequest("validate", "legacy_fixture")).json()).valid,
    true
  )
  const claimLegacy = (user = "buyer", origin = env.BASE_URL) =>
    fetch(`${env.BASE_URL}/api/account/spark`, {
      method: "POST",
      headers: {
        "x-test-user": user,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "claim-legacy" }),
    })
  assert.equal((await claimLegacy("anonymous")).status, 401)
  assert.equal(
    (await claimLegacy("buyer", "https://attacker.test")).status,
    403
  )
  assert.equal((await claimLegacy("purchaser")).status, 403)
  assert.equal(
    (await claimLegacy()).status,
    403,
    "old Test Mode licenses are not paid legacy eligibility"
  )
  db.exec("UPDATE license SET mode='live' WHERE license_key='legacy_fixture'")
  const gift = await (await claimLegacy()).json()
  assert.equal((await (await claimLegacy()).json()).licenseId, gift.licenseId)
  assert.equal((await restarted.status(true)).licenseId, gift.licenseId)
  await restarted.require("file-metadata")
  signedIn = false
  assert.equal((await new SparkService(options).status()).state, "active")
  signedIn = true
  await restarted.deactivate()
  assert.equal(db.get("SELECT COUNT(*) n FROM spark_legacy_claim").n, 1)
  assert.equal(
    db.get(
      "SELECT COUNT(*) n FROM license_event WHERE event_type='spark.legacy_claimed'"
    ).n,
    1
  )
  console.log(
    "PASS: legacy eligibility → authenticated one-time claim → Lite automatic activation → perpetual offline grant; no duplicate gift"
  )
  console.log(
    "PASS: legacy activation/validation and certificate shape remain compatible; new plan cannot bypass the Lite account/device protocol"
  )
  console.log(
    "PASS: loopback checkout → simulated signed payment webhook → purchaser CDK → different recipient redemption → OAuth-bound device → Lite signature verification → feature check → signed-out restart → release"
  )
} finally {
  globalThis.fetch = realFetch
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  db.close()
  await fs.rm(dir, { recursive: true, force: true })
}
