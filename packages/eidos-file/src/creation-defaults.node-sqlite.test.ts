import { DatabaseSync } from "node:sqlite"
import { it } from "vitest"
import { NodeSqliteConnectionPort } from "./node-sqlite"
import { expectCreationDefaultsConformance } from "./creation-defaults.conformance"
const probe = new DatabaseSync(":memory:")
const supported =
  "serialize" in probe && "limits" in probe && "setAuthorizer" in probe
probe.close()
it.runIf(supported)(
  "infers creation defaults through Electron node:sqlite",
  async () => {
    const port = new NodeSqliteConnectionPort(
      new DatabaseSync(":memory:", {
        readBigInts: true,
        enableForeignKeyConstraints: true,
      })
    )
    try {
      await expectCreationDefaultsConformance(port)
    } finally {
      port.close()
    }
  }
)
