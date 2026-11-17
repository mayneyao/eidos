import { DatabaseSync } from "node:sqlite"
import { it } from "vitest"
import { NodeSqliteConnectionPort } from "./node-sqlite"
import { expectTemporalDefaultsConformance } from "./temporal-defaults.conformance"

const probe = new DatabaseSync(":memory:")
const supported =
  "serialize" in probe && "limits" in probe && "setAuthorizer" in probe
probe.close()

it.runIf(supported)(
  "applies temporal defaults through Electron node:sqlite Runtime",
  async () => {
    const connection = new NodeSqliteConnectionPort(
      new DatabaseSync(":memory:", {
        readBigInts: true,
        enableForeignKeyConstraints: true,
      })
    )
    try {
      await expectTemporalDefaultsConformance(connection)
    } finally {
      connection.close()
    }
  }
)
