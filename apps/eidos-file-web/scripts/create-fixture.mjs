import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  createEidosFileUuid,
  EidosFileRuntime,
  initializeEidosFileSchema,
  validateEidosFile,
} from "../../../packages/eidos-file/dist/index.mjs"

class WasmConnection {
  capabilities = {
    int64: true,
    json1: true,
    returning: true,
    interrupt: true,
    scalarFunctions: true,
  }
  transactionDepth = 0

  constructor(database, sqlite) {
    this.database = database
    this.sqlite = sqlite
  }

  exec(sql) {
    this.database.exec(sql)
  }

  query(sql, params = []) {
    return this.database.selectObjects(sql, params)
  }

  get(sql, params = []) {
    return this.query(sql, params)[0]
  }

  run(sql, params = []) {
    const statement = this.database.prepare(sql)
    try {
      if (params.length > 0) statement.bind(params)
      statement.step()
    } finally {
      statement.finalize()
    }
    return {
      changes: this.database.changes(),
      lastInsertRowid:
        this.database.selectValue("SELECT last_insert_rowid()") ?? 0,
    }
  }

  runMany(sql, parameterSets) {
    const statement = this.database.prepare(sql)
    try {
      for (const params of parameterSets) {
        statement.bind(params).step()
        statement.reset(true)
      }
    } finally {
      statement.finalize()
    }
  }

  registerFunction(name, operation, arity = operation.length) {
    this.database.createFunction(
      name,
      (_context, ...values) => operation(...values),
      {
        arity,
        deterministic: true,
      }
    )
  }

  transaction(operation) {
    const depth = this.transactionDepth++
    const savepoint = `eidos_fixture_${depth}`
    this.database.exec(
      depth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`
    )
    try {
      const result = operation()
      this.database.exec(depth === 0 ? "COMMIT" : `RELEASE ${savepoint}`)
      return result
    } catch (error) {
      this.database.exec(
        depth === 0
          ? "ROLLBACK"
          : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`
      )
      throw error
    } finally {
      this.transactionDepth -= 1
    }
  }

  dataVersion() {
    return this.get("PRAGMA data_version")?.data_version ?? 0
  }

  interrupt() {
    this.sqlite.capi.sqlite3_interrupt(this.database.pointer)
  }

  close() {
    this.database.close()
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`Conformance smoke failed: ${message}`)
}

function runConformanceSmoke(sqlite) {
  const database = new sqlite.oo1.DB(":memory:", "c")
  const connection = new WasmConnection(database, sqlite)
  try {
    initializeEidosFileSchema(connection, { title: "Conformance smoke" })
    const runtime = new EidosFileRuntime(connection)
    const teams = runtime.createTable({
      name: "Teams",
      fields: [
        { name: "Name", type: "text", isRecordLabel: true },
        { name: "Active", type: "checkbox" },
      ],
    })
    const teamName = runtime
      .listFields(teams.id)
      .find((field) => field.name === "Name")
    const teamActive = runtime
      .listFields(teams.id)
      .find((field) => field.name === "Active")
    assert(teamName && teamActive, "Team source Fields exist")
    const projects = runtime.createTable({
      name: "Projects",
      fields: [
        { name: "Name", type: "text", isRecordLabel: true },
        { name: "Budget", columnName: "Budget", type: "number" },
        {
          name: "Team",
          columnName: "Team",
          type: "relation",
          property: {
            targetTableId: teams.id,
            direction: "forward",
            cardinality: "one",
            onDelete: "restrict",
          },
        },
        {
          name: "Budget with tax",
          columnName: "Budget with tax",
          type: "formula",
          property: { formula: '"Budget" * 1.2', displayType: "number" },
        },
        {
          name: "Relation count",
          type: "lookup",
          property: {
            relationField: "Team",
            targetField: teamName.id,
            aggregate: "count",
            displayType: "integer",
          },
        },
        {
          name: "Team name",
          columnName: "Team name",
          type: "lookup",
          property: {
            relationField: "Team",
            targetField: teamName.id,
            aggregate: "first",
            displayType: "text",
          },
        },
        {
          name: "Team active flags",
          type: "lookup",
          property: {
            relationField: "Team",
            targetField: teamActive.id,
            aggregate: "values",
            displayType: "checkbox",
          },
        },
        {
          name: "Has active team",
          type: "lookup",
          property: {
            relationField: "Team",
            targetField: teamActive.id,
            aggregate: "first",
            displayType: "checkbox",
          },
        },
      ],
    })
    const projectFields = runtime.listFields(projects.id)
    const projectName = projectFields.find((field) => field.name === "Name")
    const budget = projectFields.find((field) => field.name === "Budget")
    const teamRelation = projectFields.find((field) => field.name === "Team")
    const budgetWithTax = projectFields.find(
      (field) => field.name === "Budget with tax"
    )
    const relationCount = projectFields.find(
      (field) => field.name === "Relation count"
    )
    const teamNameLookup = projectFields.find(
      (field) => field.name === "Team name"
    )
    const hasActiveTeam = projectFields.find(
      (field) => field.name === "Has active team"
    )
    assert(
      projectName &&
        budget &&
        teamRelation &&
        budgetWithTax &&
        relationCount &&
        teamNameLookup &&
        hasActiveTeam,
      "source and derived Fields exist"
    )

    const inverse = runtime.addField(teams.id, {
      name: "Projects",
      columnName: "Projects",
      type: "relation",
      property: {
        targetTableId: projects.id,
        direction: "inverse",
        sourceFieldId: teamRelation.id,
        cardinality: "many",
      },
    })
    const totalBudget = runtime.addField(teams.id, {
      name: "Total project budget",
      columnName: "Total project budget",
      type: "lookup",
      property: {
        relationField: inverse.id,
        targetField: budgetWithTax.id,
        aggregate: "sum",
        displayType: "number",
      },
    })

    const teamRow = runtime.insertRow(teams.id, {
      Name: "Runtime",
      Active: true,
    })
    const teamId = String(teamRow._id)
    runtime.insertRow(projects.id, {
      Name: "Straße",
      Budget: 10,
      Team: [teamId],
    })
    runtime.insertRow(projects.id, { Name: "Beta", Budget: 20, Team: [teamId] })

    const directIdentity = connection.get(
      `SELECT typeof(project."_id") AS row_type,
              json_extract(project."Team", '$[0]') AS relation_id,
              typeof(meta.file_id) AS file_id_type
         FROM "Projects" project, eidos__meta meta LIMIT 1`
    )
    assert(
      directIdentity?.row_type === "text" &&
        directIdentity?.file_id_type === "text" &&
        directIdentity?.relation_id === teamId,
      "SQLite, API, and Relation arrays use identical UUIDv7 TEXT"
    )
    assert(
      connection.get(
        `SELECT count(*) AS count
           FROM "Projects" project,
                json_each(project."Team") item
           JOIN "Teams" team ON item.value = team."_id"`
      )?.count === 2,
      "Relation-to-Row joins require no UUID conversion"
    )

    const logicalProjects = runtime.queryRows(projects.id).rows
    assert(logicalProjects.length === 2, "logical project rows are returned")
    assert(
      runtime.countRows(projects.id, { search: "STRASSE" }) === 1,
      "search uses Unicode Default Case Folding"
    )
    assert(
      logicalProjects.every((row) => row.fields[relationCount.id] === 1),
      "Lookup count evaluates Relation arrays"
    )
    assert(
      logicalProjects.every(
        (row) => row.fields[teamNameLookup.id] === "Runtime"
      ),
      "Lookup resolves the target Record Label"
    )
    assert(
      logicalProjects.every((row) => row.fields[hasActiveTeam.id] === true),
      "Lookup first preserves checkbox values"
    )
    const logicalTeam = runtime.queryRows(teams.id).rows[0]
    assert(
      logicalTeam?.fields[totalBudget.id] === 36,
      "inverse nested Lookup is set-based"
    )

    const sortedQuery = {
      sorts: [{ field: budgetWithTax.id, direction: "desc", nulls: "last" }],
    }
    const firstPage = runtime.getRowPage(projects.id, 0, 1, sortedQuery)
    const secondPage = runtime.getRowPage(
      projects.id,
      1,
      1,
      sortedQuery,
      2,
      firstPage.nextCursor
    )
    assert(
      firstPage.rows[0]?._id !== secondPage.rows[0]?._id,
      "keyset cursor advances"
    )
    assert(
      Number(firstPage.rows[0]?.[budgetWithTax.tableColumnName]) === 24 &&
        Number(secondPage.rows[0]?.[budgetWithTax.tableColumnName]) === 12,
      "derived multi-sort order is stable"
    )

    const revision = runtime.metadata().revision
    const mutation = runtime.mutateRows({
      tableId: projects.id,
      expectedRevision: revision,
      insert: [
        {
          fields: {
            [projectName.id]: "Gamma",
            [budget.id]: 30,
            [teamRelation.id]: [teamId],
          },
        },
      ],
    })
    assert(
      mutation.rows[0]?.fields[budget.id] === 30,
      "mutateRows uses Field-ID values"
    )
    assert(
      mutation.revision === revision + 1,
      "mutateRows increments revision exactly once"
    )
    let stale = false
    try {
      runtime.mutateRows({
        tableId: projects.id,
        expectedRevision: revision,
        delete: [teamId],
      })
    } catch {
      stale = true
    }
    assert(stale, "mutateRows rejects a stale expected revision")

    runtime.updateField(projects.id, "Budget", { name: "Base budget" })
    const renamedFormula = runtime
      .listFields(projects.id)
      .find((field) => field.id === budgetWithTax.id)
    assert(
      renamedFormula?.property?.formula === '"Base budget" * 1.2',
      "Field rename rewrites only Formula references"
    )

    let restricted = false
    try {
      runtime.deleteRow(teams.id, teamId)
    } catch {
      restricted = true
    }
    assert(
      restricted,
      "restrict delete policy aborts referenced target deletion"
    )
    const validation = validateEidosFile(connection, { level: "full" })
    assert(
      validation.valid,
      validation.errors.map((issue) => issue.message).join("; ")
    )
  } finally {
    connection.close()
  }
}

const directory = path.dirname(fileURLToPath(import.meta.url))
const defaultOutput = path.resolve(
  directory,
  "../fixtures/project-tracker.eidos"
)
const output = path.resolve(process.argv[2] ?? defaultOutput)
const sqlitePackageEntry = import.meta.resolve("@sqlite.org/sqlite-wasm")
const sqliteNodeModule = new URL(
  "./sqlite-wasm/jswasm/sqlite3-node.mjs",
  sqlitePackageEntry
)
const { default: sqlite3InitModule } = await import(sqliteNodeModule.href)
const sqlite = await sqlite3InitModule({
  print: () => undefined,
  printErr: console.error,
})
runConformanceSmoke(sqlite)
const database = new sqlite.oo1.DB(":memory:", "c")
const connection = new WasmConnection(database, sqlite)

try {
  initializeEidosFileSchema(connection, {
    title: "Eidos 1.0 product portfolio",
    description:
      "A multi-table Eidos File demo with Relations, Lookups, Formulas, rich Field types, and multiple Views.",
  })
  const eidosFile = new EidosFileRuntime(connection)
  const projects = eidosFile.createTable({
    name: "Projects",
    icon: "rocket",
    description:
      "A realistic portfolio that connects projects to teams and derives live planning data.",
    fields: [
      { name: "Title", type: "text", isRecordLabel: true },
      {
        name: "Status",
        columnName: "Status",
        type: "select",
        property: {
          options: [
            { name: "Backlog", color: "gray" },
            { name: "Active", color: "blue" },
            { name: "Done", color: "green" },
          ],
        },
      },
      { name: "Estimate", columnName: "Estimate", type: "number" },
      { name: "Priority", type: "rating", property: { max: 5 } },
      {
        name: "Tags",
        type: "multi-select",
        property: {
          options: [
            { name: "Runtime", color: "purple" },
            { name: "UI", color: "pink" },
            { name: "Interop", color: "orange" },
            { name: "Browser", color: "blue" },
            { name: "Desktop", color: "green" },
            { name: "Tooling", color: "gray" },
            { name: "Milestone", color: "red" },
            { name: "Spec", color: "yellow" },
          ],
        },
      },
      { name: "Due", columnName: "Due", type: "date" },
      { name: "Kickoff", type: "datetime" },
      { name: "Complete", columnName: "Complete", type: "checkbox" },
      { name: "Reference", type: "url" },
      { name: "Brief", type: "file" },
      { name: "Notes", columnName: "Notes", type: "text" },
      { name: "Context", type: "text" },
    ],
  })

  const teams = eidosFile.createTable({
    name: "Teams",
    icon: "users",
    description:
      "Ownership and capacity data used by Project Relations and Lookups.",
    fields: [
      { name: "Name", type: "text", isRecordLabel: true },
      { name: "Lead", type: "text" },
      {
        name: "Focus",
        type: "select",
        property: {
          options: [
            { name: "Runtime", color: "purple" },
            { name: "UI", color: "pink" },
            { name: "Interop", color: "orange" },
            { name: "Browser", color: "blue" },
            { name: "Desktop", color: "green" },
            { name: "Tooling", color: "gray" },
          ],
        },
      },
      { name: "Capacity", type: "integer" },
      { name: "Active", type: "checkbox" },
      { name: "Team page", type: "url" },
    ],
  })

  const teamSeed = [
    {
      Name: "Runtime Core",
      Lead: "Maya Chen",
      Focus: "Runtime",
      Capacity: 34,
      Active: true,
      "Team page": "https://editor.eidos.space/docs/runtime",
    },
    {
      Name: "Web Editor",
      Lead: "Noah Kim",
      Focus: "UI",
      Capacity: 24,
      Active: true,
      "Team page": "https://editor.eidos.space/docs/ui",
    },
    {
      Name: "File Format",
      Lead: "Priya Shah",
      Focus: "Interop",
      Capacity: 18,
      Active: true,
      "Team page": "https://editor.eidos.space/docs/format",
    },
    {
      Name: "Browser & WASM",
      Lead: "Leo Martin",
      Focus: "Browser",
      Capacity: 20,
      Active: true,
      "Team page": "https://editor.eidos.space/docs/build",
    },
    {
      Name: "Desktop Adapter",
      Lead: "Sofia Rossi",
      Focus: "Desktop",
      Capacity: 22,
      Active: true,
      "Team page": "https://editor.eidos.space/docs/runtime",
    },
    {
      Name: "Developer Experience",
      Lead: "Alex Rivera",
      Focus: "Tooling",
      Capacity: 16,
      Active: true,
      "Team page": "https://editor.eidos.space/docs/build",
    },
  ]
  const teamRows = teamSeed.map((team) => eidosFile.insertRow(teams.id, team))
  const teamIds = teamRows.map((row) => String(row._id))
  const teamFields = eidosFile.listFields(teams.id)
  const teamLead = teamFields.find((field) => field.name === "Lead")
  const teamCapacity = teamFields.find((field) => field.name === "Capacity")
  if (!teamLead || !teamCapacity) {
    throw new Error("Team fixture fields were not created")
  }

  const projectTeam = eidosFile.addField(projects.id, {
    name: "Team",
    type: "relation",
    property: {
      targetTableId: teams.id,
      direction: "forward",
      cardinality: "one",
      onDelete: "restrict",
    },
  })
  const effortScore = eidosFile.addField(projects.id, {
    name: "Effort score",
    type: "formula",
    property: {
      formula: '"Estimate" * "Priority"',
      displayType: "number",
    },
  })
  const teamLeadLookup = eidosFile.addField(projects.id, {
    name: "Team lead",
    type: "lookup",
    property: {
      relationField: projectTeam.id,
      targetField: teamLead.id,
      aggregate: "first",
      displayType: "text",
    },
  })
  const teamCapacityLookup = eidosFile.addField(projects.id, {
    name: "Team capacity",
    type: "lookup",
    property: {
      relationField: projectTeam.id,
      targetField: teamCapacity.id,
      aggregate: "first",
      displayType: "integer",
    },
  })

  const teamProjects = eidosFile.addField(teams.id, {
    name: "Projects",
    type: "relation",
    property: {
      targetTableId: projects.id,
      direction: "inverse",
      sourceFieldId: projectTeam.id,
      cardinality: "many",
    },
  })
  const teamProjectCount = eidosFile.addField(teams.id, {
    name: "Project count",
    type: "lookup",
    property: {
      relationField: teamProjects.id,
      targetField: effortScore.id,
      aggregate: "count",
      displayType: "integer",
    },
  })
  const teamTotalEffort = eidosFile.addField(teams.id, {
    name: "Total effort",
    type: "lookup",
    property: {
      relationField: teamProjects.id,
      targetField: effortScore.id,
      aggregate: "sum",
      displayType: "number",
    },
  })

  const rows = Array.from({ length: 2_500 }, (_, index) => {
    const sequence = index + 1
    const status =
      sequence % 7 === 0 ? "Done" : sequence % 3 === 0 ? "Active" : "Backlog"
    const teamIndex = (sequence - 1) % teamSeed.length
    const team = teamSeed[teamIndex]
    const tags = [
      team.Focus,
      ...(sequence % 6 === 0 ? ["Milestone"] : []),
      ...(sequence % 10 === 0 ? ["Spec"] : []),
    ]
    const date = new Date(
      Date.UTC(2026, sequence % 12, (sequence % 27) + 1, 9, 30)
    )
    return {
      Title:
        sequence === 1 ? "Ship Eidos File Web Editor" : `Project ${sequence}`,
      Status: status,
      Estimate: (sequence % 13) + 1,
      Priority: 5 - ((sequence - 1) % 5),
      Tags: tags,
      Due: date.toISOString().slice(0, 10),
      Kickoff: date.toISOString(),
      Complete: status === "Done",
      Reference: `https://editor.eidos.space/docs/${
        team.Focus === "UI" ? "ui" : "runtime"
      }#project-${sequence}`,
      Brief:
        sequence === 1
          ? [
              {
                id: createEidosFileUuid(),
                uri: "https://editor.eidos.space/docs/format",
                name: "Eidos File 1.0 format",
                mediaType: "text/html",
                size: "0",
              },
            ]
          : [],
      Notes:
        sequence % 5 === 0
          ? "Review with the Eidos File runtime and UI owners."
          : null,
      Context: JSON.stringify({
        owner: team.Lead,
        risk: sequence % 11 === 0 ? "high" : "normal",
        sprint: `S${(sequence % 12) + 1}`,
      }),
      Team: [teamIds[teamIndex]],
    }
  })

  let firstProjectId
  for (let offset = 0; offset < rows.length; offset += 250) {
    const inserted = eidosFile.insertImportedRows(
      projects.id,
      rows.slice(offset, offset + 250)
    )
    firstProjectId ??= inserted[0]?._id
  }
  const projectFields = eidosFile.listFields(projects.id)
  const titleField = projectFields.find((field) => field.name === "Title")
  const statusField = projectFields.find((field) => field.name === "Status")
  const estimateField = projectFields.find((field) => field.name === "Estimate")
  const dueField = projectFields.find((field) => field.name === "Due")
  const completeField = projectFields.find((field) => field.name === "Complete")
  const priorityField = projectFields.find((field) => field.name === "Priority")
  const tagsField = projectFields.find((field) => field.name === "Tags")
  const kickoffField = projectFields.find((field) => field.name === "Kickoff")
  const referenceField = projectFields.find(
    (field) => field.name === "Reference"
  )
  const briefField = projectFields.find((field) => field.name === "Brief")
  const notesField = projectFields.find((field) => field.name === "Notes")
  const contextField = projectFields.find((field) => field.name === "Context")
  if (
    !titleField ||
    !statusField ||
    !estimateField ||
    !dueField ||
    !completeField ||
    !priorityField ||
    !tagsField ||
    !kickoffField ||
    !referenceField ||
    !briefField ||
    !notesField ||
    !contextField
  ) {
    throw new Error("Project fixture fields were not created")
  }

  const projectGridOrder = [
    titleField,
    statusField,
    estimateField,
    dueField,
    completeField,
    projectTeam,
    effortScore,
    teamLeadLookup,
    teamCapacityLookup,
    priorityField,
    tagsField,
    kickoffField,
    referenceField,
    briefField,
    notesField,
    contextField,
  ]
  const projectGrid = eidosFile
    .listViews(projects.id)
    .find((view) => view.type === "grid")
  if (!projectGrid) throw new Error("Project Grid view was not created")
  eidosFile.updateView(projectGrid.id, {
    orderMap: Object.fromEntries(
      projectGridOrder.map((field, index) => [field.id, index])
    ),
    hiddenFields: [
      effortScore.id,
      teamLeadLookup.id,
      teamCapacityLookup.id,
      priorityField.id,
      tagsField.id,
      kickoffField.id,
      referenceField.id,
      briefField.id,
      notesField.id,
      contextField.id,
    ],
  })

  const cardOrder = [
    titleField,
    projectTeam,
    teamLeadLookup,
    estimateField,
    effortScore,
    teamCapacityLookup,
    statusField,
    dueField,
    priorityField,
    tagsField,
    completeField,
    kickoffField,
    referenceField,
    briefField,
    notesField,
    contextField,
  ]
  const cardOrderMap = Object.fromEntries(
    cardOrder.map((field, index) => [field.id, index])
  )
  eidosFile.createView(projects.id, {
    name: "By status",
    type: "kanban",
    properties: {
      groupField: statusField.id,
      cardFields: [
        projectTeam.id,
        teamLeadLookup.id,
        effortScore.id,
        estimateField.id,
        dueField.id,
      ],
    },
    orderMap: cardOrderMap,
  })
  eidosFile.createView(projects.id, {
    name: "Project cards",
    type: "gallery",
    properties: {
      cardFields: [
        projectTeam.id,
        teamLeadLookup.id,
        effortScore.id,
        estimateField.id,
        statusField.id,
        dueField.id,
      ],
    },
    orderMap: cardOrderMap,
  })
  eidosFile.createView(projects.id, {
    name: "Active roadmap",
    type: "gallery",
    properties: {
      cardFields: [
        projectTeam.id,
        teamLeadLookup.id,
        effortScore.id,
        estimateField.id,
        statusField.id,
        dueField.id,
      ],
    },
    filter: {
      type: "group",
      conjunction: "and",
      children: [
        {
          type: "rule",
          field: statusField.id,
          operator: "equals",
          value: "Active",
        },
      ],
    },
    sorts: [{ field: dueField.id, direction: "asc", nulls: "last" }],
    orderMap: cardOrderMap,
  })

  const teamName = teamFields.find((field) => field.name === "Name")
  const teamFocus = teamFields.find((field) => field.name === "Focus")
  const teamActive = teamFields.find((field) => field.name === "Active")
  const teamPage = teamFields.find((field) => field.name === "Team page")
  if (!teamName || !teamFocus || !teamActive || !teamPage) {
    throw new Error("Team presentation fields were not created")
  }
  const teamOrder = [
    teamName,
    teamLead,
    teamFocus,
    teamCapacity,
    teamActive,
    teamProjects,
    teamProjectCount,
    teamTotalEffort,
    teamPage,
  ]
  const teamOrderMap = Object.fromEntries(
    teamOrder.map((field, index) => [field.id, index])
  )
  const teamGrid = eidosFile
    .listViews(teams.id)
    .find((view) => view.type === "grid")
  if (!teamGrid) throw new Error("Team Grid view was not created")
  eidosFile.updateView(teamGrid.id, { orderMap: teamOrderMap })
  const teamCardOrder = [
    teamName,
    teamLead,
    teamFocus,
    teamCapacity,
    teamProjectCount,
    teamTotalEffort,
    teamActive,
    teamProjects,
    teamPage,
  ]
  eidosFile.createView(teams.id, {
    name: "Capacity cards",
    type: "gallery",
    properties: {
      cardFields: [
        teamLead.id,
        teamProjectCount.id,
        teamTotalEffort.id,
        teamFocus.id,
        teamCapacity.id,
      ],
    },
    orderMap: Object.fromEntries(
      teamCardOrder.map((field, index) => [field.id, index])
    ),
  })

  const validation = validateEidosFile(connection, { level: "full" })
  if (!validation.valid) {
    throw new Error(validation.errors.map((issue) => issue.message).join("; "))
  }
  if (eidosFile.countRows(projects.id) !== rows.length) {
    throw new Error("Fixture row count changed before export")
  }
  if (eidosFile.countRows(teams.id) !== teamSeed.length) {
    throw new Error("Fixture team count changed before export")
  }
  const firstProject = eidosFile.queryRows(projects.id, {
    query: { search: "Ship Eidos File Web Editor" },
    limit: 1,
    resolveRelations: true,
  }).rows[0]
  assert(
    firstProject?.id === firstProjectId,
    "first Project identity is stable"
  )
  assert(
    firstProject?.fields[effortScore.id] === 10,
    "Formula values are evaluated in the exported demo"
  )
  assert(
    firstProject?.fields[teamLeadLookup.id] === "Maya Chen" &&
      firstProject?.fields[teamCapacityLookup.id] === 34,
    "Lookups resolve related Team values in the exported demo"
  )
  assert(
    firstProject?.resolved?.[projectTeam.id]?.[0]?.label === "Runtime Core",
    "Relations resolve target Record Labels in the exported demo"
  )
  const firstTeam = eidosFile.queryRows(teams.id, { limit: 1 }).rows[0]
  assert(
    Number(firstTeam?.fields[teamProjectCount.id]) > 0 &&
      Number(firstTeam?.fields[teamTotalEffort.id]) > 0,
    "inverse Relation rollups are evaluated in the exported demo"
  )
  const canonicalRows = connection.get(
    `SELECT count(*) AS count FROM "Projects"
      WHERE typeof("_id") = 'text' AND length("_id") = 36
        AND typeof("Due") = 'text' AND length("Due") = 10
        AND typeof("Kickoff") = 'text' AND length("Kickoff") = 24
        AND json_valid("Team") AND json_array_length("Team") = 1
        AND json_valid("Tags") AND json_valid("Brief") AND json_valid("Context")
        AND typeof("_created_at") = 'text' AND length("_created_at") = 24`
  )?.count
  if (canonicalRows !== rows.length) {
    throw new Error("Fixture UUID/date/instant storage is not canonical TEXT")
  }
  const integrity = connection.get("PRAGMA integrity_check")?.integrity_check
  if (integrity !== "ok")
    throw new Error(`Fixture integrity failed: ${integrity}`)

  const bytes = sqlite.capi.sqlite3_js_db_export(database)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, bytes)
  console.log(
    JSON.stringify({
      output,
      bytes: bytes.byteLength,
      projects: rows.length,
      teams: teamSeed.length,
      advancedFields: ["Relation", "Formula", "Lookup"],
      integrity,
    })
  )
} finally {
  connection.close()
}
