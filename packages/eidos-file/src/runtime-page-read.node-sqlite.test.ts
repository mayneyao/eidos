import { DatabaseSync } from "node:sqlite"
import { it } from "vitest"
import { NodeSqliteConnectionPort } from "./node-sqlite"
import { expectBoundedRuntimePageReads } from "./runtime-page-read.conformance"
import { expectQueuedHostReads } from "./runtime-host-read.conformance"

const probe = new DatabaseSync(":memory:")
const supported =
  "serialize" in probe &&
  "limits" in probe &&
  typeof probe.setAuthorizer === "function"
probe.close()

it.runIf(supported)(
  "reads bounded Runtime pages without unused totals in Node SQLite",
  async () => {
    const connection = new NodeSqliteConnectionPort(
      new DatabaseSync(":memory:")
    )
    try {
      await expectBoundedRuntimePageReads(connection)
    } finally {
      connection.close()
    }
  }
)

it.runIf(supported)(
  "queues host reads behind a committed write and guards their lifetime",
  async () => {
    const connection = new NodeSqliteConnectionPort(
      new DatabaseSync(":memory:")
    )
    try {
      await expectQueuedHostReads(connection)
    } finally {
      connection.close()
    }
  }
)
