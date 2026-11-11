import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { GraftClient } from "../../src/main/graft/graft-client.ts"
import { GraftInProcessTransport } from "../../src/main/graft/graft-in-process-transport.ts"
import { canonicalizeSpaceRoot } from "../../src/main/space/space-paths.ts"
import {
  createEidosFile,
  openEidosFile,
} from "../../../../packages/eidos-file/src/node-sqlite.ts"
import { EIDOS_SYSTEM_METADATA_TABLES } from "../../../../packages/eidos-file/src/system-metadata-merge.ts"

const output = process.argv[2]
if (!output || !path.isAbsolute(output))
  throw new Error("Expected an absolute empty output directory")
const directory = await fs.realpath(output)
assert.equal(
  (await fs.readdir(directory)).length,
  0,
  "The fixture output directory must be empty"
)
const source = path.join(directory, "Incoming device")
const local = path.join(directory, "Demo Space")
const remote = path.join(directory, "local-remote")
const profile = path.join(directory, "profile")
await Promise.all(
  [source, local, remote, profile].map((item) => fs.mkdir(item))
)

const paths = {
  text: "01-text-conflict.md",
  deletion: "02-deleted-folder/README.md",
  rows: "03-row-conflict.eidos",
  structure: "04-field-rename.eidos",
  compatible: "05-compatible-views.eidos",
}
const guide = `# Merge UI Demo\n\n这是独立的本机演示 Space，不会访问或上传云端。\n\n| 文件 | 本地 | Incoming | 验证点 |\n| --- | --- | --- | --- |\n| 01-text-conflict.md | 下周三上线 | 下周五上线 | 双栏、Base、手动编辑、撤销 |\n| 02-deleted-folder/README.md | 删除整个目录 | 修改 README | 选本地保持删除；选 Incoming 重建目录 |\n| 03-row-conflict.eidos | Status=In progress，Notes=Local review | Status=Ready，Notes=Incoming approval | 行／单元格选择 |\n| 04-field-rename.eidos | Owner → Project lead | Owner → Assignee | 具体结构变化、完整文件选择 |\n| 05-compatible-views.eidos | 调整原 View 的字段顺序 | 新建 Incoming overview View | 自动合并、Resolved、撤销后再次自动合并 |\n\n打开右侧 Sync 面板，再选择冲突文件。05 应自动进入 Resolved；其他四项等待你手动选择。\n所有冲突解决后可点击 Complete Merge。也可 Abort Merge，回到合并前的本地版本。\n\n每轮都有独立目录。退出开发版后，重新运行 pnpm demo:eidos-lite:merge，即可开始新一轮；已有结果不会被覆盖。合并前的完整副本保存在 Demo Space 同级的 initial-state 目录。\n`
await fs.writeFile(path.join(source, "START-HERE.md"), guide)
await fs.writeFile(
  path.join(source, paths.text),
  "# Release plan\n\nLaunch date: Monday\n\nOwner: Product team\n\nThis shared paragraph stays unchanged on both devices.\n"
)
await fs.mkdir(path.dirname(path.join(source, paths.deletion)), {
  recursive: true,
})
await fs.writeFile(
  path.join(source, paths.deletion),
  "# Design notes\n\nThis folder exists in the shared base.\n\nDecision: keep the original layout.\n"
)

const rowFile = createEidosFile(path.join(source, paths.rows), {
  title: "Row conflict demo",
})
const taskTable = rowFile.createTable({
  name: "Tasks",
  fields: [
    { name: "Title", type: "text", isRecordLabel: true },
    { name: "Status", type: "text" },
    { name: "Notes", type: "text" },
  ],
})
const task = rowFile.insertRow(taskTable.id, {
  Title: "Review the merge UI",
  Status: "Backlog",
  Notes: "Shared base",
})
rowFile.insertRow(taskTable.id, {
  Title: "Keep this unchanged",
  Status: "Done",
  Notes: "Context row",
})
rowFile.close()

const schemaFile = createEidosFile(path.join(source, paths.structure), {
  title: "Field rename conflict demo",
})
const projectTable = schemaFile.createTable({
  name: "Projects",
  fields: [
    { name: "Project", type: "text", isRecordLabel: true },
    { name: "Owner", type: "text" },
  ],
})
schemaFile.insertRow(projectTable.id, {
  Project: "Sync interface",
  Owner: "Alex",
})
schemaFile.close()

const viewFile = createEidosFile(path.join(source, paths.compatible), {
  title: "Compatible View changes",
})
const ideaTable = viewFile.createTable({
  name: "Ideas",
  fields: [
    { name: "Title", type: "text", isRecordLabel: true },
    { name: "Category", type: "text" },
    { name: "Summary", type: "text" },
  ],
})
viewFile.insertRow(ideaTable.id, {
  Title: "Keep both View changes",
  Category: "UI",
  Summary: "These modifications are compatible.",
})
const baseView = viewFile.listViews(ideaTable.id)[0]!
const fields = viewFile.listFields(ideaTable.id)
const fieldId = (name: string) =>
  fields.find((field) => field.name === name)!.id
const order = [fieldId("Title"), fieldId("Summary"), fieldId("Category")]
viewFile.close()

const incoming = new GraftClient({
  sdkTransport: new GraftInProcessTransport(),
})
const ours = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
try {
  await incoming.open(source)
  await incoming.initialize(source)
  await incoming.stageAll(source)
  await incoming.commit(source, "Demo: shared base")
  await incoming.addRemote(source, "origin", `fs://${remote}`)
  await incoming.setMainUpstream(source)
  await incoming.push(source)
  await ours.clone(local, `fs://${remote}`)
  await ours.open(local)

  const policy = await ours.getMergePolicy(local)
  const resolvers = Object.fromEntries([
    ...EIDOS_SYSTEM_METADATA_TABLES.map((table) => [
      table,
      { updated_at: "max_timestamp" as const },
    ]),
    ...["Tasks", "Projects", "Ideas"].map((table) => [
      table,
      { _updated_at: "max_timestamp" as const },
    ]),
  ])
  await ours.setMergePolicy(
    local,
    {
      ...policy.policy,
      version: 1,
      same_row_merge: true,
      default_semantic_keys: ["_id"],
      column_resolvers: resolvers,
    },
    policy.policy_token
  )

  await fs.writeFile(
    path.join(source, paths.text),
    "# Release plan\n\nLaunch date: Friday\n\nOwner: Incoming team\n\nThis shared paragraph stays unchanged on both devices.\n"
  )
  await fs.writeFile(
    path.join(source, paths.deletion),
    "# Design notes\n\nThe incoming device keeps this folder.\n\nDecision: use the reviewed two-column layout.\n"
  )
  const incomingRows = openEidosFile(path.join(source, paths.rows))
  incomingRows.updateRow(taskTable.id, String(task._id), {
    Status: "Ready",
    Notes: "Incoming approval",
  })
  incomingRows.close()
  const incomingSchema = openEidosFile(path.join(source, paths.structure))
  incomingSchema.updateField(projectTable.id, "Owner", { name: "Assignee" })
  incomingSchema.close()
  const incomingViews = openEidosFile(path.join(source, paths.compatible))
  const addedView = incomingViews.createView(ideaTable.id, {
    name: "Incoming grid",
    type: "grid",
  })
  incomingViews.updateView(addedView.id, { name: "Incoming overview" })
  incomingViews.close()
  await incoming.stageAll(source)
  await incoming.commit(
    source,
    "Demo: incoming edits, field rename and new View"
  )
  await incoming.push(source)

  await fs.writeFile(
    path.join(local, paths.text),
    "# Release plan\n\nLaunch date: Wednesday\n\nOwner: Local team\n\nThis shared paragraph stays unchanged on both devices.\n"
  )
  await fs.rm(path.dirname(path.join(local, paths.deletion)), {
    recursive: true,
  })
  const localRows = openEidosFile(path.join(local, paths.rows))
  localRows.updateRow(taskTable.id, String(task._id), {
    Status: "In progress",
    Notes: "Local review",
  })
  localRows.close()
  const localSchema = openEidosFile(path.join(local, paths.structure))
  localSchema.updateField(projectTable.id, "Owner", { name: "Project lead" })
  localSchema.close()
  const localViews = openEidosFile(path.join(local, paths.compatible))
  localViews.updateView(baseView.id, {
    properties: { ...baseView.properties, fieldOrder: order },
  })
  localViews.close()
  await ours.stageAll(local)
  const head = await ours.commit(
    local,
    "Demo: local edits, directory deletion and View layout"
  )
  await ours.fetch(local)
  const plan = await ours.planMerge(local, "origin/main", head.id)
  const status = await ours.applyMerge(
    local,
    "origin/main",
    head.id,
    plan.planToken
  )
  assert.equal(status.state, "merging")
  if (status.state !== "merging") throw new Error("Expected an active merge")
  const page = await ours.listMergePaths(local, status.stateToken, {
    filter: "all",
    limit: 100,
  })
  const conflicts: Record<
    string,
    Awaited<ReturnType<GraftClient["listMergeConflicts"]>>
  > = {}
  for (const item of page.items) {
    if (item.kind === "sqlite_database")
      conflicts[item.path] = await ours.listMergeConflicts(
        local,
        item.path,
        status.stateToken,
        { limit: 100 }
      )
  }
  assert.equal(
    status.unmergedCount,
    5,
    "Expected all five review scenarios before Lite semantic recovery"
  )
  assert.deepEqual(
    page.items
      .filter((item) => item.state === "unmerged")
      .map((item) => item.path)
      .sort(),
    Object.values(paths).sort()
  )
  assert(
    conflicts[paths.rows]?.items.some(
      (item) => item.kind === "row" && item.table === "Tasks"
    ),
    "Expected a Tasks row conflict"
  )
  assert(
    conflicts[paths.structure]?.items.some((item) => item.kind === "schema"),
    "Expected a field-rename schema conflict"
  )
  await fs.writeFile(
    path.join(directory, "fixture.json"),
    JSON.stringify(
      {
        directory,
        local,
        source,
        remote,
        profile,
        paths,
        taskTableId: taskTable.id,
        projectTableId: projectTable.id,
        ideaTableId: ideaTable.id,
        taskId: task._id,
        baseViewId: baseView.id,
        incomingViewId: addedView.id,
        status,
        page,
        conflicts,
      },
      null,
      2
    )
  )
  console.log(
    JSON.stringify(
      {
        directory,
        local,
        profile,
        status,
        paths: page.items.map((item) => ({
          path: item.path,
          state: item.state,
          kind: item.kind,
        })),
      },
      null,
      2
    )
  )
} finally {
  await incoming.close()
  await ours.close()
}

await fs.cp(local, path.join(directory, "initial-state"), { recursive: true })
const space = await canonicalizeSpaceRoot(local, profile)
await fs.writeFile(
  path.join(profile, "recent-spaces.json"),
  JSON.stringify([
    {
      id: space.id,
      name: space.name,
      path: space.root,
      lastOpenedAt: new Date().toISOString(),
    },
  ])
)
await fs.writeFile(path.join(directory, "SCENARIOS.md"), guide)
