// No provider credentials, persistent database, or remote requests. Bundle both
// repositories' actual handlers and Lite service, then drive them over loopback.
import { createRequire } from "node:module"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
const root = fileURLToPath(new URL("..", import.meta.url))
const accountRoot = path.resolve(
  process.env.EIDOS_SPARK_ACCOUNT_REPO || path.join(root, "../eidos.space")
)
const require = createRequire(
  path.join(root, "apps/eidos-lite-desktop/package.json")
)
const { build } = require("esbuild")
const temporary = await mkdtemp(path.join(os.tmpdir(), "spark-integration-"))
try {
  await build({
    entryPoints: [
      path.join(root, "scripts/spark-local-integration.fixture.ts"),
    ],
    outfile: path.join(temporary, "integration.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["better-sqlite3"],
    alias: {
      "spark-account": path.join(accountRoot, "src/lib/billing/spark.ts"),
      "spark-webhook": path.join(
        accountRoot,
        "src/lib/billing/creem-webhook.ts"
      ),
      "spark-route": path.join(accountRoot, "src/lib/spark-route.ts"),
      "spark-checkout-route": path.join(
        accountRoot,
        "src/pages/api/account/spark-checkout.ts"
      ),
      "spark-devices": path.join(accountRoot, "src/lib/sync-devices.ts"),
      "spark-account-route": path.join(
        accountRoot,
        "src/pages/api/account/spark.ts"
      ),
      "spark-d1": path.join(accountRoot, "tests/helpers/d1-sqlite.mjs"),
      "spark-legacy-activate": path.join(
        accountRoot,
        "src/pages/api/license/activate.ts"
      ),
      "spark-legacy-validate": path.join(
        accountRoot,
        "src/pages/api/license/validate.ts"
      ),
    },
    define: { __SPARK_ACCOUNT_ROOT__: JSON.stringify(accountRoot) },
  })
  await import(pathToFileURL(path.join(temporary, "integration.mjs")).href)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
