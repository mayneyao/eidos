import { DatabaseSync } from "node:sqlite"
import { it } from "vitest"
import { NodeSqliteConnectionPort } from "../../../../packages/eidos-file/src/node-sqlite"
import { verifyLookupRelation } from "../../../../packages/eidos-file-ui/src/lookup-relation.test-helper"

it("Issue 188: native Lookup of Relation preserves IDs, labels, targets and aggregate values", async () => {
  await verifyLookupRelation(
    new NodeSqliteConnectionPort(new DatabaseSync(":memory:"))
  )
})
