import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  EidosFileRuntime,
  initializeEidosFileSchema,
  validateEidosFile,
} from "../../../packages/eidos-file/dist/index.mjs"
import { getFieldCapabilityMatrixData } from "./field-capability-matrix-data.mjs"
import { ZH_TEMPLATE_LOCALIZATIONS } from "./template-localizations.mjs"

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
      { arity, deterministic: true }
    )
  }

  transaction(operation) {
    const depth = this.transactionDepth++
    const savepoint = `eidos_template_${depth}`
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

function requiredField(runtime, tableId, name) {
  const field = runtime
    .listFields(tableId)
    .find((candidate) => candidate.name === name)
  if (!field) throw new Error(`Missing ${name} Field`)
  return field
}

function fieldMap(runtime, tableId) {
  return new Map(
    runtime.listFields(tableId).map((field) => [field.name, field])
  )
}

function configureViews(runtime, tableId, config) {
  const fields = runtime.listFields(tableId)
  const byName = fieldMap(runtime, tableId)
  const resolve = (names) =>
    names.map((name) => {
      const field = byName.get(name)
      if (!field) throw new Error(`View references missing ${name} Field`)
      return field
    })
  const orderMap = (names) =>
    Object.fromEntries(resolve(names).map((field, index) => [field.id, index]))
  const defaultGrid = runtime
    .listViews(tableId)
    .find((view) => view.type === "grid")
  if (!defaultGrid) throw new Error("Default Grid view is missing")
  const visible = new Set(config.grid)
  const gridProperties = {
    ...(defaultGrid.properties ?? {}),
    ...(config.gridProperties ?? {}),
    ...(config.statistics
      ? {
          columnStats: Object.fromEntries(
            config.statistics.map(({ field: name, type }) => [
              requiredField(runtime, tableId, name).id,
              { type },
            ])
          ),
        }
      : {}),
  }
  runtime.updateView(defaultGrid.id, {
    properties: gridProperties,
    orderMap: orderMap(config.order ?? config.grid),
    hiddenFields: fields
      .filter(
        (field) =>
          !field.isHidden &&
          field.valueKind !== "system" &&
          !visible.has(field.name)
      )
      .map((field) => field.id),
  })

  for (const view of config.views ?? []) {
    const layout = { ...(view.properties ?? {}) }
    for (const key of ["groupField", "titleField", "coverField"]) {
      if (typeof layout[key] === "string") {
        layout[key] = byName.get(layout[key])?.id ?? layout[key]
      }
    }
    if (Array.isArray(layout.cardFields)) {
      layout.cardFields = layout.cardFields.map((name) =>
        typeof name === "string" ? (byName.get(name)?.id ?? name) : name
      )
    }
    runtime.createView(tableId, {
      name: view.name,
      type: view.type,
      properties: layout,
      orderMap: orderMap(view.order ?? config.order ?? config.grid),
      ...(view.filter
        ? {
            filter: {
              type: "group",
              conjunction: "and",
              children: view.filter.map((rule) => ({
                type: "rule",
                field: requiredField(runtime, tableId, rule.field).id,
                operator: rule.operator,
                value: rule.value,
              })),
            },
          }
        : {}),
      ...(view.sorts
        ? {
            sorts: view.sorts.map((sort) => ({
              field: requiredField(runtime, tableId, sort.field).id,
              direction: sort.direction,
              nulls: sort.nulls ?? "last",
            })),
          }
        : {}),
    })
  }
}

function insertRows(runtime, tableId, rows) {
  for (let offset = 0; offset < rows.length; offset += 250) {
    runtime.insertImportedRows(tableId, rows.slice(offset, offset + 250))
  }
}

function isoDate(dayOffset) {
  return new Date(Date.UTC(2026, 6, 1 + dayOffset)).toISOString().slice(0, 10)
}

function selectOptions(values) {
  const colors = ["gray", "blue", "green", "orange", "purple", "red"]
  return {
    options: values.map((name, index) => ({
      name,
      color: colors[index % colors.length],
    })),
  }
}

const FEATURE_LAB_INSTANT = "2026-07-23T08:00:00.000Z"
const FEATURE_LAB_FILE_ID = "019b0000-0000-7000-8000-000000000000"
const FIELD_CAPABILITY_MATRIX_INSTANT = "2026-07-23T08:00:00.000Z"
const FIELD_CAPABILITY_MATRIX_FILE_IDS = {
  en: "019b1000-0000-7000-8000-000000000001",
  zh: "019b1000-0000-7000-8000-000000000002",
}

function featureLabEnvironment() {
  let sequence = 0
  return {
    nowInstant: () => FEATURE_LAB_INSTANT,
    allocateId: () => {
      sequence += 1
      return `019b0000-0000-7000-8000-${sequence
        .toString(16)
        .padStart(12, "0")}`
    },
  }
}

function featureLabFileValue(sequence, overrides = {}) {
  return {
    id: `019b0001-0000-7000-8000-${sequence.toString(16).padStart(12, "0")}`,
    uri: `assets/feature-lab/asset-${sequence}.png`,
    name: `feature-lab-${sequence}.png`,
    mediaType: "image/png",
    size: String(2_048 + sequence),
    ...overrides,
  }
}

function fieldCapabilityMatrixEnvironment(locale) {
  let sequence = 0
  const namespace = locale === "zh" ? "019b1002" : "019b1001"
  return {
    nowInstant: () => FIELD_CAPABILITY_MATRIX_INSTANT,
    allocateId: () => {
      sequence += 1
      return `${namespace}-0000-7000-8000-${sequence
        .toString(16)
        .padStart(12, "0")}`
    },
  }
}

function fieldCapabilityRows(fields, rows) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [fields[key], value])
    )
  )
}

function buildFieldCapabilityMatrix(runtime, locale) {
  const data = getFieldCapabilityMatrixData(locale)
  const fields = data.fields
  const matrix = runtime.createTable({
    name: data.matrixTable,
    icon: "table-properties",
    description: data.matrixDescription,
    fields: [
      { name: fields.fieldKind, type: "text", isRecordLabel: true },
      { name: fields.canonicalValue, type: "text" },
      {
        name: fields.mutation,
        type: "select",
        property: selectOptions(data.statuses.mutation),
      },
      { name: fields.filter, type: "text" },
      {
        name: fields.sort,
        type: "select",
        property: selectOptions(data.statuses.support),
      },
      {
        name: fields.group,
        type: "select",
        property: selectOptions(data.statuses.support),
      },
      { name: fields.search, type: "text" },
      { name: fields.wholeCellAggregate, type: "text" },
      { name: fields.semanticSummary, type: "text" },
      {
        name: fields.formulaOperand,
        type: "select",
        property: selectOptions(data.statuses.formula),
      },
      { name: fields.lookupResult, type: "text" },
      {
        name: fields.recordLabel,
        type: "select",
        property: selectOptions(data.statuses.support),
      },
      { name: fields.csv, type: "text" },
      {
        name: fields.layerOwners,
        type: "multi-select",
        property: selectOptions(data.statuses.layers),
      },
      { name: fields.uiAdapter, type: "text" },
    ],
  })
  insertRows(
    runtime,
    matrix.id,
    fieldCapabilityRows(fields, data.capabilityRows)
  )
  configureViews(runtime, matrix.id, {
    grid: [
      fields.fieldKind,
      fields.canonicalValue,
      fields.mutation,
      fields.filter,
      fields.sort,
      fields.group,
      fields.search,
      fields.wholeCellAggregate,
      fields.semanticSummary,
      fields.formulaOperand,
      fields.lookupResult,
      fields.recordLabel,
      fields.csv,
      fields.layerOwners,
      fields.uiAdapter,
    ],
    gridProperties: { freezeColumns: 1, rowDensity: "compact" },
  })

  const statistics = runtime.createTable({
    name: data.statisticsTable,
    icon: "chart-no-axes-column-increasing",
    description: data.statisticsDescription,
    fields: [
      { name: fields.metric, type: "text", isRecordLabel: true },
      { name: fields.meaning, type: "text" },
      { name: fields.scalar, type: "text" },
      { name: fields.multiValue, type: "text" },
    ],
  })
  insertRows(
    runtime,
    statistics.id,
    fieldCapabilityRows(fields, data.statisticsRows)
  )
  configureViews(runtime, statistics.id, {
    grid: [fields.metric, fields.meaning, fields.scalar, fields.multiValue],
    gridProperties: { freezeColumns: 1, rowDensity: "compact" },
  })

  const glossary = runtime.createTable({
    name: data.glossaryTable,
    icon: "book-open-text",
    description: data.glossaryDescription,
    fields: [
      { name: fields.term, type: "text", isRecordLabel: true },
      { name: fields.definition, type: "text" },
      {
        name: fields.owner,
        type: "select",
        property: selectOptions(data.statuses.layers),
      },
    ],
  })
  insertRows(
    runtime,
    glossary.id,
    fieldCapabilityRows(fields, data.glossaryRows)
  )
  configureViews(runtime, glossary.id, {
    grid: [fields.term, fields.definition, fields.owner],
    gridProperties: { freezeColumns: 1, rowDensity: "compact" },
  })
}

function buildPersonalCrm(runtime) {
  const companies = runtime.createTable({
    name: "Companies",
    icon: "building-2",
    fields: [
      { name: "Name", type: "text", isRecordLabel: true },
      {
        name: "Industry",
        type: "select",
        property: selectOptions([
          "Technology",
          "Design",
          "Education",
          "Healthcare",
        ]),
      },
      { name: "Website", type: "url" },
      { name: "Tier", type: "rating", property: { max: 5 } },
      { name: "Active", type: "checkbox" },
    ],
  })
  const people = runtime.createTable({
    name: "People",
    icon: "contact-round",
    fields: [
      { name: "Name", type: "text", isRecordLabel: true },
      { name: "Role", type: "text" },
      {
        name: "Relationship",
        type: "select",
        property: selectOptions(["New", "Warm", "Close"]),
      },
      {
        name: "Tags",
        type: "multi-select",
        property: selectOptions(["Friend", "Client", "Mentor", "Community"]),
      },
      { name: "Relationship score", type: "rating", property: { max: 5 } },
      { name: "Last contacted", type: "date" },
      { name: "Follow up", type: "checkbox" },
      { name: "Profile", type: "url" },
      { name: "Notes", type: "text" },
    ],
  })
  const interactions = runtime.createTable({
    name: "Interactions",
    icon: "messages-square",
    fields: [
      { name: "Subject", type: "text", isRecordLabel: true },
      {
        name: "Type",
        type: "select",
        property: selectOptions(["Call", "Meeting", "Message", "Event"]),
      },
      { name: "Date", type: "date" },
      { name: "Follow up", type: "checkbox" },
      { name: "Notes", type: "text" },
    ],
  })

  const companyRows = [
    ["Northstar Labs", "Technology", 5],
    ["Field Notes Studio", "Design", 4],
    ["Open Learning Guild", "Education", 4],
    ["Kindred Health", "Healthcare", 3],
    ["Small Hours", "Design", 3],
    ["Local Systems", "Technology", 4],
    ["Common Thread", "Education", 3],
    ["Care Practice", "Healthcare", 4],
  ].map(([Name, Industry, Tier], index) =>
    runtime.insertRow(companies.id, {
      Name,
      Industry,
      Tier,
      Active: index !== 6,
      Website: `https://example.com/company-${index + 1}`,
    })
  )
  const companyIds = companyRows.map((row) => String(row._id))
  const company = runtime.addField(people.id, {
    name: "Company",
    type: "relation",
    property: {
      targetTableId: companies.id,
      direction: "forward",
      cardinality: "one",
      onDelete: "restrict",
    },
  })
  runtime.addField(people.id, {
    name: "Engagement",
    type: "formula",
    property: {
      formula: '"Relationship score" * 20.0',
      displayType: "number",
    },
  })
  runtime.addField(people.id, {
    name: "Company industry",
    type: "lookup",
    property: {
      relationField: company.id,
      targetField: requiredField(runtime, companies.id, "Industry").id,
      aggregate: "first",
      displayType: "text",
    },
  })
  runtime.addField(people.id, {
    name: "Company website",
    type: "lookup",
    property: {
      relationField: company.id,
      targetField: requiredField(runtime, companies.id, "Website").id,
      aggregate: "first",
      displayType: "url",
    },
  })
  const person = runtime.addField(interactions.id, {
    name: "Person",
    type: "relation",
    property: {
      targetTableId: people.id,
      direction: "forward",
      cardinality: "one",
      onDelete: "restrict",
    },
  })
  runtime.addField(interactions.id, {
    name: "Person role",
    type: "lookup",
    property: {
      relationField: person.id,
      targetField: requiredField(runtime, people.id, "Role").id,
      aggregate: "first",
      displayType: "text",
    },
  })
  const peopleInverse = runtime.addField(companies.id, {
    name: "People",
    type: "relation",
    property: {
      targetTableId: people.id,
      direction: "inverse",
      sourceFieldId: company.id,
      cardinality: "many",
    },
  })
  runtime.addField(companies.id, {
    name: "Contact count",
    type: "lookup",
    property: {
      relationField: peopleInverse.id,
      targetField: requiredField(runtime, people.id, "Relationship score").id,
      aggregate: "count",
      displayType: "integer",
    },
  })
  runtime.addField(companies.id, {
    name: "Average relationship",
    type: "lookup",
    property: {
      relationField: peopleInverse.id,
      targetField: requiredField(runtime, people.id, "Relationship score").id,
      aggregate: "average",
      displayType: "number",
    },
  })

  const firstNames = [
    "Avery",
    "Mina",
    "Theo",
    "Nora",
    "Sam",
    "Iris",
    "Jonah",
    "Leila",
    "Rowan",
  ]
  const lastNames = ["Stone", "Chen", "Martin", "Park"]
  const roles = ["Founder", "Designer", "Engineer", "Researcher"]
  const peopleRows = Array.from({ length: 36 }, (_, index) => ({
    Name: `${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / 9)]}`,
    Role: roles[index % roles.length],
    Relationship: ["Close", "Warm", "New"][index % 3],
    Tags: [["Friend", "Community"], ["Client"], ["Mentor"], ["Community"]][
      index % 4
    ],
    "Relationship score": 5 - (index % 5),
    "Last contacted": isoDate(-(index % 45)),
    "Follow up": index % 4 === 0,
    Profile: `https://example.com/people/${index + 1}`,
    Notes: index % 3 === 0 ? "Reconnect around the next milestone." : null,
    Company: [companyIds[index % companyIds.length]],
  }))
  const insertedPeople = []
  for (const row of peopleRows)
    insertedPeople.push(runtime.insertRow(people.id, row))
  const peopleIds = insertedPeople.map((row) => String(row._id))
  insertRows(
    runtime,
    interactions.id,
    Array.from({ length: 72 }, (_, index) => ({
      Subject: `${["Catch up", "Project review", "Introduction", "Coffee"][index % 4]} · ${peopleRows[index % peopleRows.length].Name}`,
      Type: ["Call", "Meeting", "Message", "Event"][index % 4],
      Date: isoDate(-(index % 60)),
      "Follow up": index % 5 === 0,
      Notes: index % 2 === 0 ? "Capture the next concrete step." : null,
      Person: [peopleIds[index % peopleIds.length]],
    }))
  )

  configureViews(runtime, people.id, {
    grid: [
      "Name",
      "Role",
      "Company",
      "Relationship",
      "Engagement",
      "Company industry",
    ],
    order: [
      "Name",
      "Company",
      "Role",
      "Relationship",
      "Engagement",
      "Company industry",
      "Last contacted",
      "Follow up",
      "Tags",
      "Relationship score",
      "Company website",
      "Profile",
      "Notes",
    ],
    views: [
      {
        name: "Relationship board",
        type: "kanban",
        properties: { groupField: "Relationship" },
      },
      {
        name: "People cards",
        type: "gallery",
        properties: { titleField: "Name" },
      },
      {
        name: "Follow ups",
        type: "grid",
        filter: [{ field: "Follow up", operator: "equals", value: true }],
        sorts: [{ field: "Last contacted", direction: "asc" }],
      },
    ],
  })
  configureViews(runtime, companies.id, {
    grid: ["Name", "Industry", "Tier", "Contact count", "Average relationship"],
    order: [
      "Name",
      "Industry",
      "Tier",
      "Contact count",
      "Average relationship",
      "Active",
      "Website",
      "People",
    ],
    views: [
      {
        name: "Company cards",
        type: "gallery",
        properties: { titleField: "Name" },
      },
    ],
  })
  configureViews(runtime, interactions.id, {
    grid: ["Subject", "Person", "Person role", "Type", "Date", "Follow up"],
    views: [
      {
        name: "By interaction",
        type: "kanban",
        properties: { groupField: "Type" },
      },
    ],
  })
}

function buildHouseholdFinance(runtime) {
  const accounts = runtime.createTable({
    name: "Accounts",
    icon: "landmark",
    fields: [
      { name: "Name", type: "text", isRecordLabel: true },
      {
        name: "Type",
        type: "select",
        property: selectOptions(["Checking", "Savings", "Card", "Cash"]),
      },
      { name: "Opening balance", type: "number" },
      { name: "Active", type: "checkbox" },
    ],
  })
  const categories = runtime.createTable({
    name: "Categories",
    icon: "tags",
    fields: [
      { name: "Name", type: "text", isRecordLabel: true },
      {
        name: "Kind",
        type: "select",
        property: selectOptions(["Needs", "Wants", "Savings", "Income"]),
      },
      { name: "Monthly budget", type: "number" },
      { name: "Essential", type: "checkbox" },
    ],
  })
  const transactions = runtime.createTable({
    name: "Transactions",
    icon: "receipt-text",
    fields: [
      { name: "Merchant", type: "text", isRecordLabel: true },
      { name: "Date", type: "date" },
      {
        name: "Direction",
        type: "select",
        property: selectOptions(["Expense", "Income"]),
      },
      { name: "Amount", type: "number" },
      { name: "Flow", type: "integer" },
      { name: "Cleared", type: "checkbox" },
      {
        name: "Tags",
        type: "multi-select",
        property: selectOptions(["Recurring", "Shared", "Travel", "Work"]),
      },
      { name: "Receipt", type: "url" },
      { name: "Notes", type: "text" },
    ],
  })
  const accountRows = [
    ["Daily checking", "Checking", 4200],
    ["Rainy day", "Savings", 12500],
    ["Everyday card", "Card", 0],
    ["Wallet", "Cash", 180],
  ].map(([Name, Type, openingBalance]) =>
    runtime.insertRow(accounts.id, {
      Name,
      Type,
      "Opening balance": openingBalance,
      Active: true,
    })
  )
  const categorySeed = [
    ["Home", "Needs", 1800, true],
    ["Food", "Needs", 700, true],
    ["Transport", "Needs", 320, true],
    ["Health", "Needs", 240, true],
    ["Leisure", "Wants", 280, false],
    ["Travel", "Wants", 400, false],
    ["Long-term savings", "Savings", 900, false],
    ["Salary", "Income", 0, false],
  ]
  const categoryRows = categorySeed.map(([Name, Kind, budget, Essential]) =>
    runtime.insertRow(categories.id, {
      Name,
      Kind,
      "Monthly budget": budget,
      Essential,
    })
  )
  const accountIds = accountRows.map((row) => String(row._id))
  const categoryIds = categoryRows.map((row) => String(row._id))
  const account = runtime.addField(transactions.id, {
    name: "Account",
    type: "relation",
    property: {
      targetTableId: accounts.id,
      direction: "forward",
      cardinality: "one",
      onDelete: "restrict",
    },
  })
  const category = runtime.addField(transactions.id, {
    name: "Category",
    type: "relation",
    property: {
      targetTableId: categories.id,
      direction: "forward",
      cardinality: "one",
      onDelete: "restrict",
    },
  })
  const signedAmount = runtime.addField(transactions.id, {
    name: "Signed amount",
    type: "formula",
    property: { formula: '"Amount" * "Flow"', displayType: "number" },
  })
  runtime.addField(transactions.id, {
    name: "Category kind",
    type: "lookup",
    property: {
      relationField: category.id,
      targetField: requiredField(runtime, categories.id, "Kind").id,
      aggregate: "first",
      displayType: "text",
    },
  })
  runtime.addField(transactions.id, {
    name: "Category budget",
    type: "lookup",
    property: {
      relationField: category.id,
      targetField: requiredField(runtime, categories.id, "Monthly budget").id,
      aggregate: "first",
      displayType: "number",
    },
  })
  runtime.addField(transactions.id, {
    name: "Account type",
    type: "lookup",
    property: {
      relationField: account.id,
      targetField: requiredField(runtime, accounts.id, "Type").id,
      aggregate: "first",
      displayType: "text",
    },
  })
  const categoryTransactions = runtime.addField(categories.id, {
    name: "Transactions",
    type: "relation",
    property: {
      targetTableId: transactions.id,
      direction: "inverse",
      sourceFieldId: category.id,
      cardinality: "many",
    },
  })
  runtime.addField(categories.id, {
    name: "Transaction count",
    type: "lookup",
    property: {
      relationField: categoryTransactions.id,
      targetField: requiredField(runtime, transactions.id, "Amount").id,
      aggregate: "count",
      displayType: "integer",
    },
  })
  runtime.addField(categories.id, {
    name: "Net activity",
    type: "lookup",
    property: {
      relationField: categoryTransactions.id,
      targetField: signedAmount.id,
      aggregate: "sum",
      displayType: "number",
    },
  })
  const accountTransactions = runtime.addField(accounts.id, {
    name: "Transactions",
    type: "relation",
    property: {
      targetTableId: transactions.id,
      direction: "inverse",
      sourceFieldId: account.id,
      cardinality: "many",
    },
  })
  runtime.addField(accounts.id, {
    name: "Current activity",
    type: "lookup",
    property: {
      relationField: accountTransactions.id,
      targetField: signedAmount.id,
      aggregate: "sum",
      displayType: "number",
    },
  })

  const merchants = [
    "Market basket",
    "Metro pass",
    "Home utilities",
    "Neighborhood café",
    "Book shop",
    "Pharmacy",
    "Studio membership",
    "Monthly salary",
  ]
  insertRows(
    runtime,
    transactions.id,
    Array.from({ length: 120 }, (_, index) => {
      const income = index % 24 === 0
      const categoryIndex = income ? 7 : index % 7
      return {
        Merchant: income ? "Monthly salary" : merchants[index % 7],
        Date: isoDate(-(index % 90)),
        Direction: income ? "Income" : "Expense",
        Amount: income ? 6200 : Number((12 + ((index * 17) % 240)).toFixed(2)),
        Flow: income ? 1 : -1,
        Cleared: index % 6 !== 0,
        Tags: [
          ...(index % 4 === 0 ? ["Recurring"] : []),
          ...(index % 9 === 0 ? ["Shared"] : []),
        ],
        Receipt: `https://example.com/receipts/${index + 1}`,
        Notes: index % 10 === 0 ? "Review during the monthly close." : null,
        Account: [accountIds[index % accountIds.length]],
        Category: [categoryIds[categoryIndex]],
      }
    })
  )

  configureViews(runtime, transactions.id, {
    grid: [
      "Merchant",
      "Date",
      "Direction",
      "Amount",
      "Signed amount",
      "Category",
      "Account",
    ],
    order: [
      "Merchant",
      "Date",
      "Category",
      "Account",
      "Direction",
      "Amount",
      "Signed amount",
      "Category kind",
      "Category budget",
      "Account type",
      "Cleared",
      "Tags",
      "Receipt",
      "Notes",
      "Flow",
    ],
    views: [
      {
        name: "Money flow",
        type: "kanban",
        properties: { groupField: "Direction" },
      },
      {
        name: "Uncleared",
        type: "grid",
        filter: [{ field: "Cleared", operator: "equals", value: false }],
        sorts: [{ field: "Date", direction: "asc" }],
      },
    ],
  })
  configureViews(runtime, categories.id, {
    grid: [
      "Name",
      "Kind",
      "Monthly budget",
      "Transaction count",
      "Net activity",
      "Essential",
    ],
    order: [
      "Name",
      "Kind",
      "Monthly budget",
      "Transaction count",
      "Net activity",
      "Essential",
      "Transactions",
    ],
    views: [
      {
        name: "Budget cards",
        type: "gallery",
        properties: { titleField: "Name" },
      },
    ],
  })
  configureViews(runtime, accounts.id, {
    grid: ["Name", "Type", "Opening balance", "Current activity", "Active"],
    order: [
      "Name",
      "Type",
      "Opening balance",
      "Current activity",
      "Active",
      "Transactions",
    ],
  })
}

function buildReadingLibrary(runtime) {
  const authors = runtime.createTable({
    name: "Authors",
    icon: "feather",
    fields: [
      { name: "Name", type: "text", isRecordLabel: true },
      { name: "Country", type: "text" },
      { name: "Website", type: "url" },
    ],
  })
  const books = runtime.createTable({
    name: "Books",
    icon: "library-big",
    fields: [
      { name: "Title", type: "text", isRecordLabel: true },
      {
        name: "Status",
        type: "select",
        property: selectOptions(["Want to read", "Reading", "Finished"]),
      },
      {
        name: "Genre",
        type: "multi-select",
        property: selectOptions([
          "Fiction",
          "Essays",
          "Science",
          "History",
          "Design",
        ]),
      },
      { name: "Pages", type: "integer" },
      { name: "Pages read", type: "integer" },
      { name: "Rating", type: "rating", property: { max: 5 } },
      { name: "Started", type: "date" },
      { name: "Finished", type: "date" },
      { name: "Reference", type: "url" },
      { name: "Review", type: "text" },
    ],
  })
  const highlights = runtime.createTable({
    name: "Highlights",
    icon: "highlighter",
    fields: [
      { name: "Excerpt", type: "text", isRecordLabel: true },
      { name: "Page", type: "integer" },
      { name: "Captured", type: "date" },
      { name: "Favorite", type: "checkbox" },
      { name: "Note", type: "text" },
    ],
  })
  const authorSeed = [
    ["Ursula Le Guin", "United States"],
    ["James Baldwin", "United States"],
    ["Octavia Butler", "United States"],
    ["Italo Calvino", "Italy"],
    ["Mary Oliver", "United States"],
    ["Oliver Sacks", "United Kingdom"],
    ["Rebecca Solnit", "United States"],
    ["Robin Wall Kimmerer", "United States"],
    ["Jorge Luis Borges", "Argentina"],
    ["Joan Didion", "United States"],
  ]
  const authorRows = authorSeed.map(([Name, Country], index) =>
    runtime.insertRow(authors.id, {
      Name,
      Country,
      Website: `https://example.com/authors/${index + 1}`,
    })
  )
  const authorIds = authorRows.map((row) => String(row._id))
  const author = runtime.addField(books.id, {
    name: "Author",
    type: "relation",
    property: {
      targetTableId: authors.id,
      direction: "forward",
      cardinality: "one",
      onDelete: "restrict",
    },
  })
  runtime.addField(books.id, {
    name: "Progress",
    type: "formula",
    property: {
      formula: '"Pages read" * 100 / "Pages"',
      displayType: "number",
    },
  })
  runtime.addField(books.id, {
    name: "Author country",
    type: "lookup",
    property: {
      relationField: author.id,
      targetField: requiredField(runtime, authors.id, "Country").id,
      aggregate: "first",
      displayType: "text",
    },
  })
  const book = runtime.addField(highlights.id, {
    name: "Book",
    type: "relation",
    property: {
      targetTableId: books.id,
      direction: "forward",
      cardinality: "one",
      onDelete: "restrict",
    },
  })
  runtime.addField(highlights.id, {
    name: "Book status",
    type: "lookup",
    property: {
      relationField: book.id,
      targetField: requiredField(runtime, books.id, "Status").id,
      aggregate: "first",
      displayType: "text",
    },
  })
  const authorBooks = runtime.addField(authors.id, {
    name: "Books",
    type: "relation",
    property: {
      targetTableId: books.id,
      direction: "inverse",
      sourceFieldId: author.id,
      cardinality: "many",
    },
  })
  runtime.addField(authors.id, {
    name: "Book count",
    type: "lookup",
    property: {
      relationField: authorBooks.id,
      targetField: requiredField(runtime, books.id, "Pages").id,
      aggregate: "count",
      displayType: "integer",
    },
  })
  runtime.addField(authors.id, {
    name: "Pages collected",
    type: "lookup",
    property: {
      relationField: authorBooks.id,
      targetField: requiredField(runtime, books.id, "Pages").id,
      aggregate: "sum",
      displayType: "integer",
    },
  })

  const bookTitles = [
    "The Dispossessed",
    "The Fire Next Time",
    "Parable of the Sower",
    "Invisible Cities",
    "Upstream",
    "The Man Who Mistook His Wife for a Hat",
    "A Field Guide to Getting Lost",
    "Braiding Sweetgrass",
    "Labyrinths",
    "The White Album",
  ]
  const insertedBooks = []
  const bookRows = Array.from({ length: 40 }, (_, index) => {
    const pages = 180 + ((index * 37) % 360)
    const status = ["Finished", "Reading", "Want to read"][index % 3]
    const pagesRead =
      status === "Finished"
        ? pages
        : status === "Reading"
          ? Math.floor(pages * (0.2 + (index % 5) * 0.12))
          : 0
    return {
      Title:
        index < bookTitles.length
          ? bookTitles[index]
          : `${bookTitles[index % bookTitles.length]} · edition ${Math.floor(index / 10) + 1}`,
      Status: status,
      Genre: [
        ["Fiction"],
        ["Essays", "History"],
        ["Science"],
        ["Design", "Essays"],
      ][index % 4],
      Pages: pages,
      "Pages read": pagesRead,
      Rating: status === "Finished" ? 3 + (index % 3) : null,
      Started: status === "Want to read" ? null : isoDate(-(index % 120)),
      Finished: status === "Finished" ? isoDate(-(index % 60)) : null,
      Reference: `https://example.com/books/${index + 1}`,
      Review:
        status === "Finished" ? "A short note on what changed my mind." : null,
      Author: [authorIds[index % authorIds.length]],
    }
  })
  for (const row of bookRows)
    insertedBooks.push(runtime.insertRow(books.id, row))
  const bookIds = insertedBooks.map((row) => String(row._id))
  insertRows(
    runtime,
    highlights.id,
    Array.from({ length: 80 }, (_, index) => ({
      Excerpt: `Highlight ${index + 1}: an idea worth returning to`,
      Page: 12 + ((index * 19) % 280),
      Captured: isoDate(-(index % 80)),
      Favorite: index % 7 === 0,
      Note: index % 3 === 0 ? "Connect this with another note." : null,
      Book: [bookIds[index % bookIds.length]],
    }))
  )

  configureViews(runtime, books.id, {
    grid: ["Title", "Author", "Status", "Progress", "Rating", "Author country"],
    order: [
      "Title",
      "Author",
      "Status",
      "Progress",
      "Pages read",
      "Pages",
      "Rating",
      "Genre",
      "Author country",
      "Started",
      "Finished",
      "Reference",
      "Review",
    ],
    views: [
      {
        name: "Reading shelf",
        type: "kanban",
        properties: { groupField: "Status" },
      },
      {
        name: "Book cards",
        type: "gallery",
        properties: { titleField: "Title" },
      },
    ],
  })
  configureViews(runtime, highlights.id, {
    grid: ["Excerpt", "Book", "Book status", "Page", "Captured", "Favorite"],
    views: [
      {
        name: "Favorites",
        type: "gallery",
        properties: { titleField: "Excerpt" },
        filter: [{ field: "Favorite", operator: "equals", value: true }],
      },
    ],
  })
  configureViews(runtime, authors.id, {
    grid: ["Name", "Country", "Book count", "Pages collected", "Website"],
    order: [
      "Name",
      "Country",
      "Book count",
      "Pages collected",
      "Website",
      "Books",
    ],
  })
}

function buildHabitJournal(runtime) {
  const habits = runtime.createTable({
    name: "Habits",
    icon: "heart-pulse",
    fields: [
      { name: "Name", type: "text", isRecordLabel: true },
      {
        name: "Area",
        type: "select",
        property: selectOptions(["Body", "Mind", "Home", "Creative"]),
      },
      { name: "Target minutes", type: "integer" },
      { name: "Active", type: "checkbox" },
      { name: "Why", type: "text" },
      { name: "Resource", type: "url" },
    ],
  })
  const logs = runtime.createTable({
    name: "Daily logs",
    icon: "calendar-check-2",
    fields: [
      { name: "Entry", type: "text", isRecordLabel: true },
      { name: "Date", type: "date" },
      { name: "Minutes", type: "integer" },
      { name: "Quality", type: "rating", property: { max: 5 } },
      { name: "Completed", type: "checkbox" },
      {
        name: "Mood",
        type: "select",
        property: selectOptions(["Low", "Steady", "Energized"]),
      },
      { name: "Notes", type: "text" },
    ],
  })
  const habitSeed = [
    ["Morning walk", "Body", 30],
    ["Strength session", "Body", 45],
    ["Read deeply", "Mind", 40],
    ["Meditate", "Mind", 15],
    ["Reset the room", "Home", 20],
    ["Cook dinner", "Home", 45],
    ["Sketch", "Creative", 30],
    ["Write one page", "Creative", 35],
  ]
  const habitRows = habitSeed.map(([Name, Area, targetMinutes], index) =>
    runtime.insertRow(habits.id, {
      Name,
      Area,
      "Target minutes": targetMinutes,
      Active: true,
      Why: "Make the good choice easier to repeat.",
      Resource: `https://example.com/habits/${index + 1}`,
    })
  )
  const habitIds = habitRows.map((row) => String(row._id))
  const habit = runtime.addField(logs.id, {
    name: "Habit",
    type: "relation",
    property: {
      targetTableId: habits.id,
      direction: "forward",
      cardinality: "one",
      onDelete: "restrict",
    },
  })
  runtime.addField(logs.id, {
    name: "Focus score",
    type: "formula",
    property: {
      formula: '"Minutes" * "Quality" * 1.0',
      displayType: "number",
    },
  })
  runtime.addField(logs.id, {
    name: "Target",
    type: "lookup",
    property: {
      relationField: habit.id,
      targetField: requiredField(runtime, habits.id, "Target minutes").id,
      aggregate: "first",
      displayType: "integer",
    },
  })
  runtime.addField(logs.id, {
    name: "Area",
    type: "lookup",
    property: {
      relationField: habit.id,
      targetField: requiredField(runtime, habits.id, "Area").id,
      aggregate: "first",
      displayType: "text",
    },
  })
  const habitLogs = runtime.addField(habits.id, {
    name: "Logs",
    type: "relation",
    property: {
      targetTableId: logs.id,
      direction: "inverse",
      sourceFieldId: habit.id,
      cardinality: "many",
    },
  })
  runtime.addField(habits.id, {
    name: "Sessions",
    type: "lookup",
    property: {
      relationField: habitLogs.id,
      targetField: requiredField(runtime, logs.id, "Minutes").id,
      aggregate: "count",
      displayType: "integer",
    },
  })
  runtime.addField(habits.id, {
    name: "Total minutes",
    type: "lookup",
    property: {
      relationField: habitLogs.id,
      targetField: requiredField(runtime, logs.id, "Minutes").id,
      aggregate: "sum",
      displayType: "integer",
    },
  })
  runtime.addField(habits.id, {
    name: "Average quality",
    type: "lookup",
    property: {
      relationField: habitLogs.id,
      targetField: requiredField(runtime, logs.id, "Quality").id,
      aggregate: "average",
      displayType: "number",
    },
  })
  insertRows(
    runtime,
    logs.id,
    Array.from({ length: 120 }, (_, index) => {
      const habitIndex = index % habitSeed.length
      const quality = 2 + (index % 4)
      const target = habitSeed[habitIndex][2]
      const minutes = Math.max(5, target + ((index % 5) - 2) * 5)
      return {
        Entry: `${habitSeed[habitIndex][0]} · ${isoDate(-(index % 45))}`,
        Date: isoDate(-(index % 45)),
        Minutes: minutes,
        Quality: quality,
        Completed: minutes >= target,
        Mood: ["Steady", "Energized", "Low"][index % 3],
        Notes: index % 6 === 0 ? "Notice what made this session easier." : null,
        Habit: [habitIds[habitIndex]],
      }
    })
  )
  configureViews(runtime, logs.id, {
    grid: [
      "Entry",
      "Habit",
      "Date",
      "Minutes",
      "Target",
      "Focus score",
      "Mood",
    ],
    order: [
      "Entry",
      "Habit",
      "Date",
      "Completed",
      "Minutes",
      "Target",
      "Quality",
      "Focus score",
      "Mood",
      "Area",
      "Notes",
    ],
    views: [
      {
        name: "By mood",
        type: "kanban",
        properties: { groupField: "Mood" },
      },
      {
        name: "Completed",
        type: "grid",
        filter: [{ field: "Completed", operator: "equals", value: true }],
        sorts: [{ field: "Date", direction: "desc" }],
      },
    ],
  })
  configureViews(runtime, habits.id, {
    grid: [
      "Name",
      "Area",
      "Target minutes",
      "Sessions",
      "Total minutes",
      "Average quality",
    ],
    order: [
      "Name",
      "Area",
      "Target minutes",
      "Sessions",
      "Total minutes",
      "Average quality",
      "Active",
      "Why",
      "Resource",
      "Logs",
    ],
    views: [
      {
        name: "Habit cards",
        type: "gallery",
        properties: { titleField: "Name" },
      },
    ],
  })
}

function buildContentCalendar(runtime) {
  const channels = runtime.createTable({
    name: "Channels",
    icon: "radio-tower",
    fields: [
      { name: "Name", type: "text", isRecordLabel: true },
      {
        name: "Format",
        type: "select",
        property: selectOptions(["Article", "Video", "Newsletter", "Social"]),
      },
      { name: "Audience", type: "text" },
      { name: "Homepage", type: "url" },
    ],
  })
  const campaigns = runtime.createTable({
    name: "Campaigns",
    icon: "megaphone",
    fields: [
      { name: "Name", type: "text", isRecordLabel: true },
      { name: "Owner", type: "text" },
      { name: "Goal", type: "text" },
      { name: "Start", type: "date" },
      { name: "End", type: "date" },
      { name: "Active", type: "checkbox" },
    ],
  })
  const content = runtime.createTable({
    name: "Content",
    icon: "calendar-range",
    fields: [
      { name: "Title", type: "text", isRecordLabel: true },
      {
        name: "Stage",
        type: "select",
        property: selectOptions([
          "Idea",
          "Draft",
          "Review",
          "Scheduled",
          "Published",
        ]),
      },
      {
        name: "Topics",
        type: "multi-select",
        property: selectOptions([
          "Product",
          "Education",
          "Community",
          "Research",
        ]),
      },
      { name: "Publish date", type: "date" },
      { name: "Effort", type: "number" },
      { name: "Priority", type: "rating", property: { max: 5 } },
      { name: "Brief ready", type: "checkbox" },
      { name: "Draft", type: "url" },
      { name: "Notes", type: "text" },
    ],
  })
  const channelSeed = [
    ["Field Notes", "Article", "Curious builders"],
    ["Studio Sessions", "Video", "Product teams"],
    ["Sunday Letter", "Newsletter", "Independent creators"],
    ["Community Feed", "Social", "Open-source community"],
    ["Research Dispatch", "Article", "Technical leaders"],
  ]
  const channelRows = channelSeed.map(([Name, Format, Audience], index) =>
    runtime.insertRow(channels.id, {
      Name,
      Format,
      Audience,
      Homepage: `https://example.com/channels/${index + 1}`,
    })
  )
  const campaignSeed = [
    ["Eidos File launch", "Maya", "Teach the open format"],
    ["Summer field guide", "Noah", "Grow the newsletter"],
    ["Local-first stories", "Priya", "Share user workflows"],
    ["Builder interviews", "Leo", "Bring practitioners together"],
    ["Runtime deep dive", "Sofia", "Explain interoperability"],
    ["Community week", "Alex", "Celebrate contributors"],
    ["Desktop craft", "Mina", "Show the full application"],
    ["Year in review", "Theo", "Synthesize what changed"],
  ]
  const campaignRows = campaignSeed.map(([Name, Owner, Goal], index) =>
    runtime.insertRow(campaigns.id, {
      Name,
      Owner,
      Goal,
      Start: isoDate(index * 7),
      End: isoDate(index * 7 + 35),
      Active: index < 6,
    })
  )
  const channelIds = channelRows.map((row) => String(row._id))
  const campaignIds = campaignRows.map((row) => String(row._id))
  const channel = runtime.addField(content.id, {
    name: "Channel",
    type: "relation",
    property: {
      targetTableId: channels.id,
      direction: "forward",
      cardinality: "one",
      onDelete: "restrict",
    },
  })
  const campaign = runtime.addField(content.id, {
    name: "Campaign",
    type: "relation",
    property: {
      targetTableId: campaigns.id,
      direction: "forward",
      cardinality: "one",
      onDelete: "restrict",
    },
  })
  runtime.addField(content.id, {
    name: "Workload",
    type: "formula",
    property: {
      formula: '"Effort" * "Priority" * 1.0',
      displayType: "number",
    },
  })
  runtime.addField(content.id, {
    name: "Channel format",
    type: "lookup",
    property: {
      relationField: channel.id,
      targetField: requiredField(runtime, channels.id, "Format").id,
      aggregate: "first",
      displayType: "text",
    },
  })
  runtime.addField(content.id, {
    name: "Campaign owner",
    type: "lookup",
    property: {
      relationField: campaign.id,
      targetField: requiredField(runtime, campaigns.id, "Owner").id,
      aggregate: "first",
      displayType: "text",
    },
  })
  const campaignContent = runtime.addField(campaigns.id, {
    name: "Content",
    type: "relation",
    property: {
      targetTableId: content.id,
      direction: "inverse",
      sourceFieldId: campaign.id,
      cardinality: "many",
    },
  })
  runtime.addField(campaigns.id, {
    name: "Item count",
    type: "lookup",
    property: {
      relationField: campaignContent.id,
      targetField: requiredField(runtime, content.id, "Effort").id,
      aggregate: "count",
      displayType: "integer",
    },
  })
  runtime.addField(campaigns.id, {
    name: "Total effort",
    type: "lookup",
    property: {
      relationField: campaignContent.id,
      targetField: requiredField(runtime, content.id, "Effort").id,
      aggregate: "sum",
      displayType: "number",
    },
  })
  insertRows(
    runtime,
    content.id,
    Array.from({ length: 96 }, (_, index) => ({
      Title: `${
        [
          "Why files still matter",
          "Inside the runtime",
          "A calm data workflow",
          "Meet the builders",
          "Designing for ownership",
          "From SQLite to UI",
        ][index % 6]
      } · ${index + 1}`,
      Stage: ["Idea", "Draft", "Review", "Scheduled", "Published"][index % 5],
      Topics: [
        ["Product"],
        ["Education", "Research"],
        ["Community"],
        ["Product", "Education"],
      ][index % 4],
      "Publish date": isoDate(index - 24),
      Effort: 1 + (index % 8),
      Priority: 5 - (index % 5),
      "Brief ready": index % 3 !== 0,
      Draft: `https://example.com/drafts/${index + 1}`,
      Notes:
        index % 7 === 0 ? "Confirm examples and final call to action." : null,
      Channel: [channelIds[index % channelIds.length]],
      Campaign: [campaignIds[index % campaignIds.length]],
    }))
  )

  configureViews(runtime, content.id, {
    grid: [
      "Title",
      "Stage",
      "Channel",
      "Campaign",
      "Publish date",
      "Workload",
      "Campaign owner",
    ],
    order: [
      "Title",
      "Stage",
      "Channel",
      "Channel format",
      "Campaign",
      "Campaign owner",
      "Publish date",
      "Priority",
      "Effort",
      "Workload",
      "Topics",
      "Brief ready",
      "Draft",
      "Notes",
    ],
    views: [
      {
        name: "Editorial board",
        type: "kanban",
        properties: { groupField: "Stage" },
      },
      {
        name: "Content cards",
        type: "gallery",
        properties: { titleField: "Title" },
        sorts: [{ field: "Publish date", direction: "asc" }],
      },
      {
        name: "Published",
        type: "grid",
        filter: [{ field: "Stage", operator: "equals", value: "Published" }],
        sorts: [{ field: "Publish date", direction: "desc" }],
      },
    ],
  })
  configureViews(runtime, campaigns.id, {
    grid: [
      "Name",
      "Owner",
      "Start",
      "End",
      "Item count",
      "Total effort",
      "Active",
    ],
    order: [
      "Name",
      "Owner",
      "Goal",
      "Start",
      "End",
      "Item count",
      "Total effort",
      "Active",
      "Content",
    ],
    views: [
      {
        name: "Campaign cards",
        type: "gallery",
        properties: { titleField: "Name" },
      },
    ],
  })
  configureViews(runtime, channels.id, {
    grid: ["Name", "Format", "Audience", "Homepage"],
  })
}

function buildFeatureLab(runtime) {
  const people = runtime.createTable({
    name: "People",
    icon: "users-round",
    description:
      "Owners and collaborators used by forward and inverse Relations.",
    fields: [
      { name: "Name", type: "text", isRecordLabel: true },
      {
        name: "Role",
        type: "select",
        property: selectOptions([
          "Research",
          "Design",
          "Engineering",
          "Operations",
        ]),
      },
      { name: "Allocation", type: "integer", nullable: false },
      { name: "Rate", type: "number" },
      { name: "Joined", type: "date" },
      { name: "Last check-in", type: "datetime" },
      { name: "Active", type: "checkbox" },
      { name: "Profile", type: "url" },
      {
        name: "Skills",
        type: "multi-select",
        property: selectOptions(["SQLite", "WASM", "UX", "Research", "QA"]),
      },
      { name: "Profile data", type: "json" },
    ],
  })
  const programs = runtime.createTable({
    name: "Programs",
    icon: "folders",
    description: "A second business dimension for portfolio grouping.",
    fields: [
      { name: "Name", type: "text", isRecordLabel: true },
      { name: "Code", type: "text" },
      { name: "Budget", type: "number", property: { format: "currency" } },
      { name: "Active", type: "checkbox" },
      { name: "Sponsor", type: "url" },
    ],
  })
  const reference = runtime.createTable({
    name: "eidos__Reference",
    icon: "database",
    description:
      "A deliberately reserved display name whose SQLite physical name uses the Eidos fallback rule.",
    fields: [
      { name: "Label", type: "text", isRecordLabel: true },
      {
        name: "Kind",
        type: "select",
        property: selectOptions(["Dataset", "Protocol", "Benchmark"]),
      },
      { name: "Version", type: "integer" },
      { name: "Canonical", type: "checkbox" },
      { name: "Metadata", type: "json" },
    ],
  })
  const experiments = runtime.createTable({
    name: "Experiments",
    icon: "flask-conical",
    description:
      "Every editable Eidos 1.0 field type, derived field family, and core View in one lab.",
    fields: [
      { name: "Experiment", type: "text", isRecordLabel: true },
      { name: "Summary", type: "text" },
      {
        name: "Budget",
        type: "number",
        property: { format: "currency", showAs: "number" },
      },
      {
        name: "Progress",
        type: "number",
        property: {
          format: "percent",
          showAs: "bar",
          color: "green",
          divideBy: 1,
          showNumber: true,
        },
      },
      { name: "Samples", type: "integer" },
      {
        name: "Stage",
        type: "select",
        property: selectOptions(["Idea", "Running", "Review", "Complete"]),
      },
      {
        name: "Signals",
        type: "multi-select",
        property: selectOptions([
          "Quality",
          "Speed",
          "Cost",
          "Risk",
          "Accessibility",
        ]),
      },
      { name: "Approved", type: "checkbox" },
      { name: "Confidence", type: "rating", property: { max: 5 } },
      { name: "Website", type: "url" },
      { name: "Start date", type: "date" },
      { name: "Review at", type: "datetime" },
      { name: "Assets", type: "file" },
      { name: "Payload", type: "json" },
    ],
  })

  const peopleSeed = [
    ["Avery Chen", "Research", 40, 175.5],
    ["Mina Park", "Design", 32, 160],
    ["Theo Martin", "Engineering", 38, 190.25],
    ["Nora Stone", "Operations", 28, 145],
    ["Sam Rivera", "Research", 36, 172],
    ["Iris Kim", "Design", 30, 158.75],
    ["Jonah Shah", "Engineering", 35, 188],
    ["Leila Rossi", "Operations", 26, 148.5],
    ["Rowan Li", "Research", 34, 169],
    ["Alex Garcia", "Design", 29, 155],
    ["Sofia Wilson", "Engineering", 37, 192],
    ["Noah Brown", "Operations", 27, 150],
  ]
  const peopleRows = peopleSeed.map(([Name, Role, Allocation, Rate], index) =>
    runtime.insertRow(people.id, {
      Name,
      Role,
      Allocation,
      Rate,
      Joined: isoDate(-400 + index * 21),
      "Last check-in": new Date(
        Date.UTC(2026, 6, 22 - (index % 10), 8 + (index % 6), 15)
      ).toISOString(),
      Active: index !== 11,
      Profile: `https://example.com/people/${index + 1}`,
      Skills: [
        ["SQLite", "Research"],
        ["UX", "Accessibility"],
        ["WASM", "QA"],
        ["QA"],
      ][index % 4],
      "Profile data": {
        locale: index % 2 === 0 ? "en" : "zh",
        timezone: ["Asia/Shanghai", "Europe/Paris", "America/New_York"][
          index % 3
        ],
      },
    })
  )
  const peopleIds = peopleRows.map((row) => String(row._id))

  const programRows = [
    ["Open format", "FMT", 420000],
    ["Browser runtime", "WASM", 360000],
    ["Editor craft", "UI", 280000],
    ["Interoperability", "IO", 310000],
  ].map(([Name, Code, Budget], index) =>
    runtime.insertRow(programs.id, {
      Name,
      Code,
      Budget,
      Active: index !== 3,
      Sponsor: `https://example.com/programs/${String(Code).toLowerCase()}`,
    })
  )
  const programIds = programRows.map((row) => String(row._id))

  const referenceRows = [
    ["Eidos File 1.0", "Protocol"],
    ["Runtime conformance", "Benchmark"],
    ["Accessibility corpus", "Dataset"],
    ["WASM performance", "Benchmark"],
    ["Design tokens", "Dataset"],
    ["Interop checklist", "Protocol"],
  ].map(([Label, Kind], index) =>
    runtime.insertRow(reference.id, {
      Label,
      Kind,
      Version: index + 1,
      Canonical: index < 2,
      Metadata: { edition: 1, owner: "Feature Lab", sequence: index + 1 },
    })
  )
  const referenceIds = referenceRows.map((row) => String(row._id))

  const owner = runtime.addField(experiments.id, {
    name: "Owner",
    type: "relation",
    property: {
      targetTableId: people.id,
      direction: "forward",
      cardinality: "one",
      onDelete: "restrict",
    },
  })
  const collaborators = runtime.addField(experiments.id, {
    name: "Collaborators",
    type: "relation",
    property: {
      targetTableId: people.id,
      direction: "forward",
      cardinality: "many",
      onDelete: "detach",
    },
  })
  const program = runtime.addField(experiments.id, {
    name: "Program",
    type: "relation",
    property: {
      targetTableId: programs.id,
      direction: "forward",
      cardinality: "one",
      onDelete: "preserve",
    },
  })
  const source = runtime.addField(experiments.id, {
    name: "Reference source",
    type: "relation",
    property: {
      targetTableId: reference.id,
      direction: "forward",
      cardinality: "one",
      onDelete: "restrict",
    },
  })

  const ownerAllocation = runtime.addField(experiments.id, {
    name: "Owner allocation",
    type: "lookup",
    property: {
      relationField: owner.id,
      targetField: requiredField(runtime, people.id, "Allocation").id,
      aggregate: "first",
      displayType: "integer",
    },
  })
  runtime.addField(experiments.id, {
    name: "Owner active",
    type: "lookup",
    property: {
      relationField: owner.id,
      targetField: requiredField(runtime, people.id, "Active").id,
      aggregate: "first",
      displayType: "checkbox",
    },
  })
  runtime.addField(experiments.id, {
    name: "Owner profile",
    type: "lookup",
    property: {
      relationField: owner.id,
      targetField: requiredField(runtime, people.id, "Profile").id,
      aggregate: "first",
      displayType: "url",
    },
  })
  runtime.addField(experiments.id, {
    name: "Owner profile data",
    type: "lookup",
    property: {
      relationField: owner.id,
      targetField: requiredField(runtime, people.id, "Profile data").id,
      aggregate: "first",
      displayType: "json",
    },
  })
  runtime.addField(experiments.id, {
    name: "Contributor names",
    type: "lookup",
    property: {
      relationField: collaborators.id,
      targetField: requiredField(runtime, people.id, "Name").id,
      aggregate: "values",
      displayType: "text",
      distinct: true,
    },
  })
  runtime.addField(experiments.id, {
    name: "First collaborator",
    type: "lookup",
    property: {
      relationField: collaborators.id,
      targetField: requiredField(runtime, people.id, "Name").id,
      aggregate: "first",
      displayType: "text",
    },
  })
  const contributorCount = runtime.addField(experiments.id, {
    name: "Contributor count",
    type: "lookup",
    property: {
      relationField: collaborators.id,
      targetField: requiredField(runtime, people.id, "Allocation").id,
      aggregate: "count",
      displayType: "integer",
    },
  })
  runtime.addField(experiments.id, {
    name: "Total allocation",
    type: "lookup",
    property: {
      relationField: collaborators.id,
      targetField: requiredField(runtime, people.id, "Allocation").id,
      aggregate: "sum",
      displayType: "integer",
    },
  })
  runtime.addField(experiments.id, {
    name: "Average rate",
    type: "lookup",
    property: {
      relationField: collaborators.id,
      targetField: requiredField(runtime, people.id, "Rate").id,
      aggregate: "average",
      displayType: "number",
    },
  })
  runtime.addField(experiments.id, {
    name: "Earliest join",
    type: "lookup",
    property: {
      relationField: collaborators.id,
      targetField: requiredField(runtime, people.id, "Joined").id,
      aggregate: "min",
      displayType: "date",
    },
  })
  runtime.addField(experiments.id, {
    name: "Latest check-in",
    type: "lookup",
    property: {
      relationField: collaborators.id,
      targetField: requiredField(runtime, people.id, "Last check-in").id,
      aggregate: "max",
      displayType: "datetime",
    },
  })

  const weightedBudget = runtime.addField(experiments.id, {
    name: "Weighted budget",
    type: "formula",
    property: { formula: '"Budget" * "Progress"', displayType: "number" },
  })
  runtime.addField(experiments.id, {
    name: "Sample successor",
    type: "formula",
    property: { formula: '"Samples" + 1', displayType: "integer" },
  })
  runtime.addField(experiments.id, {
    name: "Lab headline",
    type: "formula",
    property: {
      formula: "CONCAT(\"Experiment\", ' · lab')",
      displayType: "text",
    },
  })
  runtime.addField(experiments.id, {
    name: "Ready",
    type: "formula",
    property: { formula: '"Approved" = TRUE', displayType: "checkbox" },
  })
  runtime.addField(experiments.id, {
    name: "Next review",
    type: "formula",
    property: {
      formula: 'DATE_ADD_DAYS("Start date", 14)',
      displayType: "date",
    },
  })
  runtime.addField(experiments.id, {
    name: "Follow-up at",
    type: "formula",
    property: {
      formula: 'DATETIME_ADD_MILLISECONDS("Review at", 3600000)',
      displayType: "datetime",
    },
  })
  runtime.addField(experiments.id, {
    name: "Canonical page",
    type: "formula",
    property: { formula: '"Website"', displayType: "url" },
  })
  runtime.addField(experiments.id, {
    name: "Payload mirror",
    type: "formula",
    property: { formula: '"Payload"', displayType: "json" },
  })
  const relationBackedLoad = runtime.addField(experiments.id, {
    name: "Relation-backed load",
    type: "formula",
    property: {
      formula: '"Owner allocation" + "Contributor count"',
      displayType: "integer",
    },
  })

  const ownedExperiments = runtime.addField(people.id, {
    name: "Owned experiments",
    type: "relation",
    property: {
      targetTableId: experiments.id,
      direction: "inverse",
      sourceFieldId: owner.id,
      cardinality: "many",
    },
  })
  runtime.addField(people.id, {
    name: "Owned count",
    type: "lookup",
    property: {
      relationField: ownedExperiments.id,
      targetField: requiredField(runtime, experiments.id, "Samples").id,
      aggregate: "count",
      displayType: "integer",
    },
  })
  const collaboratingExperiments = runtime.addField(people.id, {
    name: "Collaborating experiments",
    type: "relation",
    property: {
      targetTableId: experiments.id,
      direction: "inverse",
      sourceFieldId: collaborators.id,
      cardinality: "many",
    },
  })
  runtime.addField(people.id, {
    name: "Collaborating budget",
    type: "lookup",
    property: {
      relationField: collaboratingExperiments.id,
      targetField: weightedBudget.id,
      aggregate: "sum",
      displayType: "number",
    },
  })

  const experimentNames = [
    "Feature Lab launch",
    "Relation labels",
    "Formula dependency graph",
    "Lookup aggregation",
    "Canonical dates",
    "Portable attachments",
    "Saved View behavior",
    "Physical naming",
  ]
  const experimentRows = Array.from({ length: 180 }, (_, index) => {
    const sequence = index + 1
    const start = new Date(Date.UTC(2026, 0, 1 + (index % 300)))
    const ownerIndex = index % peopleIds.length
    const collaboratorsForRow =
      index % 9 === 8
        ? []
        : [
            peopleIds[(ownerIndex + 1) % peopleIds.length],
            ...(index % 3 === 0
              ? [peopleIds[(ownerIndex + 2) % peopleIds.length]]
              : []),
          ]
    return {
      Experiment:
        index < experimentNames.length
          ? experimentNames[index]
          : `Feature experiment ${String(sequence).padStart(3, "0")}`,
      Summary:
        index === 1
          ? ""
          : index % 11 === 0
            ? null
            : "Change one source value and watch derived fields update.",
      Budget:
        index === 2 ? -1_234.5 : index === 3 ? 0 : 125_000.5 + index * 725.25,
      Progress:
        index === 0
          ? 0.8
          : index === 1
            ? 0
            : index === 2
              ? 1
              : (index % 10) / 10,
      Samples:
        index === 2
          ? -9_223_372_036_854_775_808n
          : index === 3
            ? 9_223_372_036_854_775_807n
            : 120 + index,
      Stage:
        index % 13 === 12
          ? null
          : ["Running", "Idea", "Review", "Complete"][index % 4],
      Signals:
        index % 10 === 9
          ? []
          : [
              ["Quality", "Accessibility"],
              ["Speed"],
              ["Cost", "Risk"],
              ["Quality", "Speed", "Cost"],
            ][index % 4],
      Approved: index % 7 === 6 ? null : index % 3 !== 1,
      Confidence: index % 6,
      Website: `https://editor.eidos.space/feature-lab#experiment-${sequence}`,
      "Start date":
        index === 4
          ? "0001-01-01"
          : index === 5
            ? "9999-12-01"
            : start.toISOString().slice(0, 10),
      "Review at":
        index === 4
          ? "0001-01-01T00:00:00.000Z"
          : index === 5
            ? "9999-12-01T23:59:59.999Z"
            : new Date(start.getTime() + 9 * 3_600_000).toISOString(),
      Assets:
        index === 0
          ? [
              featureLabFileValue(1, {
                uri: "https://editor.eidos.space/docs/format",
                name: "Eidos File 1.0",
                mediaType: "text/html",
                size: "0",
              }),
              featureLabFileValue(2),
            ]
          : index % 12 === 0
            ? [featureLabFileValue(100 + index)]
            : [],
      Payload:
        index % 14 === 13
          ? null
          : {
              flags: ["offline-first", index % 2 === 0 ? "wasm" : "sqlite"],
              measurement: index / 10,
              nested: { empty: "", exactInteger: "9223372036854775807" },
              sequence,
            },
      Owner: [peopleIds[ownerIndex]],
      Collaborators: collaboratorsForRow,
      Program: [programIds[index % programIds.length]],
      "Reference source": [referenceIds[index % referenceIds.length]],
    }
  })
  insertRows(runtime, experiments.id, experimentRows)

  configureViews(runtime, experiments.id, {
    grid: [
      "Experiment",
      "Stage",
      "Owner",
      "Collaborators",
      "Progress",
      "Assets",
      "Samples",
      "Weighted budget",
      "Contributor names",
      "Relation-backed load",
    ],
    order: [
      "Experiment",
      "Stage",
      "Owner",
      "Collaborators",
      "Program",
      "Reference source",
      "Progress",
      "Budget",
      "Samples",
      "Approved",
      "Confidence",
      "Signals",
      "Start date",
      "Review at",
      "Website",
      "Assets",
      "Summary",
      "Payload",
      "Weighted budget",
      "Sample successor",
      "Lab headline",
      "Ready",
      "Next review",
      "Follow-up at",
      "Canonical page",
      "Payload mirror",
      "Owner allocation",
      "Owner active",
      "Owner profile",
      "Owner profile data",
      "Contributor names",
      "First collaborator",
      "Contributor count",
      "Total allocation",
      "Average rate",
      "Earliest join",
      "Latest check-in",
      "Relation-backed load",
    ],
    gridProperties: { freezeColumns: 2, rowDensity: "compact" },
    statistics: [
      { field: "Budget", type: "sum" },
      { field: "Samples", type: "average" },
      { field: "Stage", type: "count-distinct" },
      { field: "Collaborators", type: "relation-distinct-target-count" },
    ],
    views: [
      {
        name: "By stage",
        type: "kanban",
        properties: {
          groupField: "Stage",
          coverField: "Assets",
          cardFields: ["Owner", "Progress", "Ready", "Contributor names"],
          cardSize: "medium",
          coverFit: "contain",
          hideEmptyFields: true,
          showEmptyGroups: false,
        },
      },
      {
        name: "Lab gallery",
        type: "gallery",
        properties: {
          coverField: "Assets",
          cardFields: [
            "Stage",
            "Owner",
            "Collaborators",
            "Weighted budget",
            "Next review",
          ],
          cardSize: "large",
          coverFit: "contain",
          hideEmptyFields: false,
        },
        sorts: [{ field: "Review at", direction: "asc", nulls: "last" }],
      },
      {
        name: "Ready queue",
        type: "grid",
        filter: [
          { field: "Approved", operator: "equals", value: true },
          { field: "Progress", operator: "greater-than", value: 0.5 },
        ],
        sorts: [
          { field: "Stage", direction: "asc" },
          { field: "Weighted budget", direction: "desc" },
        ],
      },
      {
        name: "Missing summaries",
        type: "grid",
        filter: [{ field: "Summary", operator: "is-empty" }],
        sorts: [{ field: "Experiment", direction: "asc" }],
      },
      {
        name: "Quality signals",
        type: "grid",
        filter: [
          { field: "Signals", operator: "is-any-of", value: ["Quality"] },
        ],
        sorts: [{ field: "Start date", direction: "desc" }],
      },
    ],
  })
  configureViews(runtime, people.id, {
    grid: [
      "Name",
      "Role",
      "Allocation",
      "Active",
      "Owned experiments",
      "Owned count",
      "Collaborating budget",
    ],
    order: [
      "Name",
      "Role",
      "Allocation",
      "Rate",
      "Joined",
      "Last check-in",
      "Active",
      "Profile",
      "Skills",
      "Profile data",
      "Owned experiments",
      "Owned count",
      "Collaborating experiments",
      "Collaborating budget",
    ],
    views: [
      {
        name: "People cards",
        type: "gallery",
        properties: {
          cardFields: ["Role", "Allocation", "Owned count"],
          cardSize: "small",
        },
      },
    ],
  })
  configureViews(runtime, programs.id, {
    grid: ["Name", "Code", "Budget", "Active", "Sponsor"],
    statistics: [{ field: "Budget", type: "sum" }],
  })
  configureViews(runtime, reference.id, {
    grid: ["Label", "Kind", "Version", "Canonical", "Metadata"],
  })

  const first = runtime.queryRows(experiments.id, {
    query: { search: "Feature Lab launch" },
    limit: 1,
    resolveRelations: true,
  }).rows[0]
  if (
    Math.abs(Number(first?.fields[weightedBudget.id]) - 100_000.4) > 0.001 ||
    Number(first.fields[contributorCount.id]) !== 2 ||
    Number(first.fields[ownerAllocation.id]) !== 40 ||
    Number(first.fields[relationBackedLoad.id]) !== 42 ||
    first.resolved?.[owner.id]?.[0]?.label !== "Avery Chen"
  ) {
    throw new Error(
      `Feature Lab derived fields or Relation labels are invalid: ${[
        first?.fields[weightedBudget.id],
        first?.fields[contributorCount.id],
        first?.fields[ownerAllocation.id],
        first?.fields[relationBackedLoad.id],
        first?.resolved?.[owner.id]?.[0]?.label,
      ].map(String)}`
    )
  }
}

const templates = [
  {
    fileName: "personal-crm.eidos",
    title: "Personal CRM",
    description: "People, companies, and relationship history",
    build: buildPersonalCrm,
  },
  {
    fileName: "household-finance.eidos",
    title: "Household finance",
    description: "Accounts, categories, budgets, and transactions",
    build: buildHouseholdFinance,
  },
  {
    fileName: "reading-library.eidos",
    title: "Reading library",
    description: "Books, authors, reading progress, and highlights",
    build: buildReadingLibrary,
  },
  {
    fileName: "habit-journal.eidos",
    title: "Habit journal",
    description: "Daily logs, targets, quality, and rollups",
    build: buildHabitJournal,
  },
  {
    fileName: "content-calendar.eidos",
    title: "Content calendar",
    description: "Campaigns, channels, editorial stages, and workload",
    build: buildContentCalendar,
  },
  {
    fileName: "feature-lab.eidos",
    title: "Eidos 1.0 Feature Lab",
    description:
      "All editable fields, Relations, Lookups, Formulas, and core Views",
    fileOptions: {
      fileId: FEATURE_LAB_FILE_ID,
      createdAt: FEATURE_LAB_INSTANT,
    },
    environment: featureLabEnvironment,
    build: buildFeatureLab,
  },
  {
    fileName: "field-capability-matrix.eidos",
    title: "Eidos Field Capability Matrix 1.0",
    description:
      "A self-contained overview of every Eidos Field kind and capability",
    fileOptions: {
      fileId: FIELD_CAPABILITY_MATRIX_FILE_IDS.en,
      createdAt: FIELD_CAPABILITY_MATRIX_INSTANT,
    },
    environment: () => fieldCapabilityMatrixEnvironment("en"),
    build: (runtime) => buildFieldCapabilityMatrix(runtime, "en"),
  },
  {
    fileName: "field-capability-matrix.zh.eidos",
    title: "Eidos 字段能力矩阵 1.0",
    description: "Eidos Field kind 与跨层能力的自包含总览",
    fileOptions: {
      fileId: FIELD_CAPABILITY_MATRIX_FILE_IDS.zh,
      createdAt: FIELD_CAPABILITY_MATRIX_INSTANT,
    },
    environment: () => fieldCapabilityMatrixEnvironment("zh"),
    build: (runtime) => buildFieldCapabilityMatrix(runtime, "zh"),
  },
]

function mutableDatabaseFromBytes(sqlite, bytes) {
  const database = new sqlite.oo1.DB(":memory:", "c")
  const capacity = bytes.byteLength + 16 * 1024 * 1024
  const pointer = sqlite.wasm.alloc(capacity)
  let ownedByDatabase = false
  try {
    sqlite.wasm.heap8u().set(bytes, pointer)
    database.checkRc(
      sqlite.capi.sqlite3_deserialize(
        database.pointer,
        "main",
        pointer,
        bytes.byteLength,
        capacity,
        sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
          sqlite.capi.SQLITE_DESERIALIZE_RESIZEABLE
      )
    )
    ownedByDatabase = true
    return database
  } finally {
    if (!ownedByDatabase) {
      sqlite.wasm.dealloc(pointer)
      database.close()
    }
  }
}

function translateRows(runtime, table, fields, rowTranslators) {
  if (!rowTranslators) return
  const translators = Object.entries(rowTranslators).map(
    ([fieldName, translate]) => {
      const field = fields.find((candidate) => candidate.name === fieldName)
      if (!field) {
        throw new Error(`${table.name}: missing translated ${fieldName} Field`)
      }
      return { field, translate }
    }
  )
  const rows = runtime.queryRows(table.id, { limit: 10_000 }).rows
  const updates = rows.flatMap((row) => {
    const changes = {}
    for (const { field, translate } of translators) {
      const current = row.fields[field.id]
      const translated = translate(current)
      if (translated !== current) changes[field.id] = translated
    }
    return Object.keys(changes).length > 0 ? [{ rowId: row.id, changes }] : []
  })
  for (let offset = 0; offset < updates.length; offset += 250) {
    runtime.updateRows(table.id, updates.slice(offset, offset + 250))
  }
}

function translateOptions(runtime, table, fields, optionTranslations) {
  for (const [fieldName, translations] of Object.entries(
    optionTranslations ?? {}
  )) {
    const field = fields.find((candidate) => candidate.name === fieldName)
    if (!field) {
      throw new Error(`${table.name}: missing translated ${fieldName} Field`)
    }
    const options = field.property?.options
    if (!Array.isArray(options)) {
      throw new Error(`${table.name}.${fieldName}: Select options are missing`)
    }
    const optionValueChanges = Object.entries(translations).map(
      ([from, to]) => ({ from, to })
    )
    runtime.updateField(table.id, field.id, {
      property: {
        ...field.property,
        options: options.map((option) => ({
          ...option,
          name: translations[option.name] ?? option.name,
        })),
      },
      optionValueChanges,
    })
  }
}

function localizeFixture(sqlite, outputDirectory, localization) {
  const source = path.join(outputDirectory, localization.source)
  const bytes = fs.readFileSync(source)
  const database = mutableDatabaseFromBytes(sqlite, bytes)
  const connection = new WasmConnection(database, sqlite)
  try {
    const runtime = new EidosFileRuntime(
      connection,
      false,
      localization.source === "feature-lab.eidos"
        ? featureLabEnvironment()
        : undefined
    )
    const tables = runtime.listTables()
    for (const table of tables) {
      const translatedTable = localization.tables[table.name]
      if (!translatedTable) {
        throw new Error(
          `${localization.source}: missing ${table.name} translation`
        )
      }
      const fields = runtime
        .listFields(table.id)
        .filter((field) => !field.name.startsWith("_"))
      const missingFields = fields.filter(
        (field) => translatedTable.fields[field.name] === undefined
      )
      if (missingFields.length > 0) {
        throw new Error(
          `${localization.source}: missing ${table.name} Field translations: ${missingFields
            .map((field) => field.name)
            .join(", ")}`
        )
      }
      const views = runtime.listViews(table.id)
      const missingViews = views.filter(
        (view) => translatedTable.views[view.name] === undefined
      )
      if (missingViews.length > 0) {
        throw new Error(
          `${localization.source}: missing ${table.name} View translations: ${missingViews
            .map((view) => view.name)
            .join(", ")}`
        )
      }

      translateRows(runtime, table, fields, translatedTable.rows)
      translateOptions(runtime, table, fields, translatedTable.options)
      for (const view of views) {
        runtime.updateView(view.id, { name: translatedTable.views[view.name] })
      }
      for (const field of fields) {
        runtime.updateField(table.id, field.id, {
          name: translatedTable.fields[field.name],
        })
      }
      runtime.updateTable(table.id, {
        name: translatedTable.name,
        ...(translatedTable.description
          ? { description: translatedTable.description }
          : {}),
      })
    }

    const validation = validateEidosFile(connection, { level: "full" })
    if (!validation.valid) {
      throw new Error(
        `${localization.output}: ${validation.errors
          .map((issue) => issue.message)
          .join("; ")}`
      )
    }
    const integrity = connection.get("PRAGMA integrity_check")?.integrity_check
    if (integrity !== "ok") {
      throw new Error(
        `${localization.output}: integrity_check returned ${integrity}`
      )
    }
    const outputBytes = sqlite.capi.sqlite3_js_db_export(database)
    fs.writeFileSync(
      path.join(outputDirectory, localization.output),
      outputBytes
    )
    return {
      fileName: localization.output,
      bytes: outputBytes.byteLength,
      tables: runtime.listTables().map((localizedTable) => ({
        name: localizedTable.name,
        rows: runtime.queryRows(localizedTable.id, { limit: 10_000 }).rows
          .length,
      })),
    }
  } finally {
    connection.close()
  }
}

const directory = path.dirname(fileURLToPath(import.meta.url))
const outputDirectory = path.resolve(directory, "../fixtures")
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

fs.mkdirSync(outputDirectory, { recursive: true })
const requestedTemplate = process.argv[2]
const selectedTemplates = requestedTemplate
  ? templates.filter(
      (template) =>
        template.fileName.replace(/\.eidos$/u, "") === requestedTemplate
    )
  : templates
if (requestedTemplate && selectedTemplates.length === 0) {
  throw new Error(`Unknown template fixture: ${requestedTemplate}`)
}
const generated = []
for (const template of selectedTemplates) {
  const database = new sqlite.oo1.DB(":memory:", "c")
  const connection = new WasmConnection(database, sqlite)
  try {
    initializeEidosFileSchema(connection, {
      title: template.title,
      description: template.description,
      ...(template.fileOptions ?? {}),
    })
    const runtime = new EidosFileRuntime(
      connection,
      false,
      template.environment?.()
    )
    template.build(runtime)
    const validation = validateEidosFile(connection, { level: "full" })
    if (!validation.valid) {
      throw new Error(
        `${template.fileName}: ${validation.errors
          .map((issue) => issue.message)
          .join("; ")}`
      )
    }
    const integrity = connection.get("PRAGMA integrity_check")?.integrity_check
    if (integrity !== "ok") {
      throw new Error(
        `${template.fileName}: integrity_check returned ${integrity}`
      )
    }
    const bytes = sqlite.capi.sqlite3_js_db_export(database)
    const output = path.join(outputDirectory, template.fileName)
    fs.writeFileSync(output, bytes)
    generated.push({
      fileName: template.fileName,
      bytes: bytes.byteLength,
      tables: runtime.schema().map((table) => ({
        name: table.table.name,
        rows: runtime.queryRows(table.table.id, { limit: 10_000 }).rows.length,
      })),
    })
  } finally {
    connection.close()
  }
}

const selectedSources = new Set(
  selectedTemplates.map((template) => template.fileName)
)
const localized = ZH_TEMPLATE_LOCALIZATIONS.filter(
  (localization) =>
    !requestedTemplate || selectedSources.has(localization.source)
).map((localization) => localizeFixture(sqlite, outputDirectory, localization))

console.log(JSON.stringify({ generated, localized }, null, 2))
