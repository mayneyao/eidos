// Run from the repository root with scripts/run-electron-node.mjs.
// The Android host cannot author relation schema yet; create this fixture with the canonical Runtime.
import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createEidosFile } from "../../../packages/eidos-file/dist/node-sqlite.mjs"

const directory = new URL("../app/src/androidTest/assets/", import.meta.url)
mkdirSync(directory, { recursive: true })
const runtime = createEidosFile(fileURLToPath(new URL("relation-labels.eidos", directory)), {
  defaultTable: { name: "记录", fields: [{ name: "标题", type: "text", isRecordLabel: true }] },
})
try {
  const table = runtime.schema()[0].table
  runtime.addField(table.id, { name: "关联", type: "relation", property: {
    targetTableId: table.id, direction: "forward", cardinality: "many", onDelete: "detach",
  } })
  const target = runtime.insertRow(table.id, { 标题: "目标标题" })
  runtime.insertRow(table.id, { 标题: "来源记录", 关联: JSON.stringify([target._id]) })
} finally {
  runtime.close()
}
