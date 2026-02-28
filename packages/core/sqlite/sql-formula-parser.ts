import type {
  ExprRef,
  SelectFromStatement,
  SelectedColumn,
} from "pgsql-ast-parser"
import { astMapper, parseFirst, toSql } from "pgsql-ast-parser"

import { FieldType } from "../fields/const"
import type { IField } from "../types/IField"
import { nonNullable } from "@/lib/utils"

export const getTableNameFromSql = (sql: string) => {
  // tableName just like tb_xxx
  const tableName = sql.match(/from\s+(\w+)/i)
  return tableName ? tableName[1] : ""
}

/**
 * example:
 * sql: select * from table1
 * fields: [{name: "id", type: "number"}, {name: "name", type: "string"}]
 * return: select id, name from table1
 *
 * example2:
 * sql: select id,name from table1
 * fields: [{name: "id", type: "number","table_column_name": "cl_xxx1"}, {name: "name", type: "string"},"table_column_name": "cl_xxx2"]
 * return: select cl_xxx1 as id, cl_xxx2 as name from table1
 * @param sql
 * @param fields
 */
export const transformQuery = (sql: string, fields: IField[]) => {
  const ast = parseFirst(sql)
  const selectStatement = ast
  const fieldNameRawIdMap: Record<string, string> = {}
  fields.forEach((field) => {
    fieldNameRawIdMap[field.name.toLowerCase()] = field.table_column_name
  })
  // create a mapper
  const mapper = astMapper((map) => ({
    ref: (t) => {
      const rawName = fieldNameRawIdMap[t.name]
      if (rawName) {
        return {
          ...t,
          name: rawName,
        }
      }
      return map.super().ref(t)
    },
  }))

  const modified = mapper.statement(selectStatement)!
  return toSql.statement(modified)
}

export const transformFormula2VirtualGeneratedField = (
  columnName: string,
  fields: IField[]
) => {
  // add system field _id
  fields.push({
    name: "_id",
    type: FieldType.Text,
    table_column_name: "_id",
    table_name: fields[0].table_name,
    property: {},
  })
  // Check for circular dependencies first
  const circularCheck = detectCircularDependencies(fields)
  if (circularCheck.hasCycle) {
    throw new Error(
      `Circular dependency detected in formula fields: ${circularCheck.cycle.join(" → ")}`
    )
  }

  const formulaFields = fields.filter((f) => f.type === FieldType.Formula)
  const fieldNameRawIdMap: Record<string, string> = {}
  fields.forEach((field) => {
    fieldNameRawIdMap[field.name.toLowerCase()] = field.table_column_name
  })

  // create a mapper
  const mapper = astMapper((map) => ({
    expr: (t) => {
      // turn props("field name with space") to cl_xxx
      if (t && t.type === "call" && t.function.name === "props") {
        const param = t.args[0] as ExprRef
        const rawName = fieldNameRawIdMap[param.name.toLowerCase()]
        if (!rawName) {
          throw new Error(`column \`${param.name}\` not found`)
        }
        return {
          type: "ref",
          name: rawName,
        }
      }
      return map.super().expr(t)
    },
    ref: (t) => {
      const rawName = fieldNameRawIdMap[t.name.toLowerCase()]
      if (!rawName) {
        throw new Error(`column \`${t.name}\` not found`)
      }
      if (rawName) {
        return {
          ...t,
          name: rawName,
        }
      }
      return map.super().ref(t)
    },
  }))
  const field = formulaFields.find((f) => f.table_column_name === columnName)
  if (!field) return null
  const ast = parseFirst(`select ${field.property.formula}`)
  const modified = mapper.statement(ast) as SelectFromStatement
  const sql = toSql.statement(modified)

  return sql.replace("SELECT", "").trim()
}

export const transformQueryWithFormulaFields2Sql = (
  query: string,
  fields: IField[]
) => {
  // we drop this solution but use sqlite virtual generated field, it's more simple
  return query
  const formulaFields = fields.filter((f) => f.type === FieldType.Formula)
  const fieldNameRawIdMap: Record<string, string> = {}
  fields.forEach((field) => {
    fieldNameRawIdMap[field.name.toLowerCase()] = field.table_column_name
  })
  const ast = parseFirst(query)
  const selectStatement = ast as SelectFromStatement

  // create a mapper
  const mapper = astMapper((map) => ({
    ref: (t) => {
      const rawName = fieldNameRawIdMap[t.name]
      if (rawName) {
        return {
          ...t,
          name: rawName,
        }
      }
      return map.super().ref(t)
    },
  }))

  const res: SelectedColumn[] = formulaFields
    .map((field) => {
      const ast = parseFirst(
        `select ${field.property.formula} as ${field.table_column_name}`
      )
      const modified = mapper.statement(ast) as SelectFromStatement
      return modified.columns?.[0]
    })
    .filter(nonNullable)

  selectStatement.columns = [
    {
      expr: {
        type: "ref",
        name: "*",
      },
    },
    ...res,
  ]
  return toSql.statement(selectStatement)
}

/**
 * Detects circular dependencies among generated columns
 * @param fields List of fields to check for circular dependencies
 * @returns Object with result and cycle information if found
 */
export const detectCircularDependencies = (fields: IField[]) => {
  // Only consider formula fields as they become generated columns
  const formulaFields = fields.filter((f) => f.type === FieldType.Formula)

  // Create a dependency graph
  const dependencyGraph: Record<string, string[]> = {}
  const fieldNameMap: Record<string, string> = {}

  // Initialize the graph and field name mapping
  formulaFields.forEach((field) => {
    dependencyGraph[field.table_column_name] = []
    fieldNameMap[field.name.toLowerCase()] = field.table_column_name
  })

  // Build the dependency graph
  formulaFields.forEach((field) => {
    try {
      // Parse the formula to find dependencies
      const ast = parseFirst(`SELECT ${field.property.formula}`)
      const dependencies: string[] = []

      // Extract all column references from the formula
      const refVisitor = astMapper((map) => ({
        ref: (t) => {
          const columnName = fieldNameMap[t.name.toLowerCase()]
          if (
            columnName &&
            formulaFields.some((f) => f.table_column_name === columnName)
          ) {
            dependencies.push(columnName)
          }
          return map.super().ref(t)
        },
        expr: (t) => {
          // Handle props() function calls
          if (t && t.type === "call" && t.function.name === "props") {
            const param = t.args[0] as ExprRef
            const columnName = fieldNameMap[param.name.toLowerCase()]
            if (
              columnName &&
              formulaFields.some((f) => f.table_column_name === columnName)
            ) {
              dependencies.push(columnName)
            }
          }
          return map.super().expr(t)
        },
      }))

      refVisitor.statement(ast)
      dependencyGraph[field.table_column_name] = dependencies
    } catch (error) {
      console.error(`Error parsing formula for field ${field.name}:`, error)
    }
  })

  // Detect cycles using DFS
  const visited: Record<string, boolean> = {}
  const recStack: Record<string, boolean> = {}
  const cycle: string[] = []

  const isCyclicUtil = (node: string, path: string[] = []): boolean => {
    // Mark current node as visited and part of recursion stack
    visited[node] = true
    recStack[node] = true
    path.push(node)

    // Visit all the vertices adjacent to this vertex
    for (const dependency of dependencyGraph[node]) {
      // If not visited, check if it leads to a cycle
      if (!visited[dependency]) {
        if (isCyclicUtil(dependency, [...path])) {
          // If we found a cycle, record it
          const cycleStart = path.indexOf(dependency)
          if (cycleStart !== -1) {
            cycle.push(...path.slice(cycleStart), dependency)
          }
          return true
        }
      } else if (recStack[dependency]) {
        // If the vertex is already in the recursion stack, we found a cycle
        const cycleStart = path.indexOf(dependency)
        if (cycleStart !== -1) {
          cycle.push(...path.slice(cycleStart), dependency)
        }
        return true
      }
    }

    // Remove the vertex from recursion stack
    recStack[node] = false
    return false
  }

  // Check each unvisited vertex
  let hasCycle = false
  for (const node in dependencyGraph) {
    if (!visited[node]) {
      if (isCyclicUtil(node)) {
        hasCycle = true
        break
      }
    }
  }

  // Map column names back to field names for better readability
  const reverseFieldNameMap: Record<string, string> = {}
  fields.forEach((field) => {
    reverseFieldNameMap[field.table_column_name] = field.name
  })

  const readableCycle = cycle.map(
    (columnName) => reverseFieldNameMap[columnName] || columnName
  )

  return {
    hasCycle,
    cycle: hasCycle ? readableCycle : [],
    dependencyGraph,
  }
}

/**
 * Finds all formula fields that depend on a given column
 * @param columnName The column name to check dependencies for
 * @param fields List of all fields
 * @returns Array of dependent field names
 */
export const findDependentFormulaFields = (
  columnName: string,
  fields: IField[]
) => {
  // Get the field name from column name for easier reference
  const targetField = fields.find((f) => f.table_column_name === columnName)
  if (!targetField) return []

  // Build dependency graph
  const { dependencyGraph } = detectCircularDependencies(fields)

  // Create reverse dependency map
  const reverseDependencies: Record<string, string[]> = {}
  Object.entries(dependencyGraph).forEach(([field, dependencies]) => {
    dependencies.forEach((dep) => {
      if (!reverseDependencies[dep]) {
        reverseDependencies[dep] = []
      }
      reverseDependencies[dep].push(field)
    })
  })

  // Find all fields that depend on the target column (directly or indirectly)
  const dependentFields: string[] = []
  const visited: Record<string, boolean> = {}

  const findAllDependents = (col: string) => {
    if (visited[col]) return
    visited[col] = true

    const directDependents = reverseDependencies[col] || []
    directDependents.forEach((dep) => {
      dependentFields.push(dep)
      findAllDependents(dep)
    })
  }

  findAllDependents(columnName)

  // Map column names back to field names for better readability
  const reverseFieldNameMap: Record<string, string> = {}
  fields.forEach((field) => {
    reverseFieldNameMap[field.table_column_name] = field.name
  })

  return dependentFields.map((col) => ({
    columnName: col,
    fieldName: reverseFieldNameMap[col] || col,
  }))
}

/**
 * Gets the order in which formula fields should be deleted to respect dependencies
 * @param columnNames Array of column names to delete
 * @param fields List of all fields
 * @returns Ordered array of column names for deletion
 */
export const getFormulaFieldDeletionOrder = (
  columnNames: string[],
  fields: IField[]
) => {
  // Build dependency graph
  const { dependencyGraph } = detectCircularDependencies(fields)

  // Create a subgraph with only the columns we want to delete
  const subgraph: Record<string, string[]> = {}
  columnNames.forEach((col) => {
    if (dependencyGraph[col]) {
      subgraph[col] = dependencyGraph[col].filter((dep) =>
        columnNames.includes(dep)
      )
    }
  })

  // Topological sort to get deletion order
  const visited: Record<string, boolean> = {}
  const temp: Record<string, boolean> = {}
  const order: string[] = []

  const visit = (node: string) => {
    if (temp[node]) {
      throw new Error("Circular dependency detected")
    }
    if (!visited[node] && subgraph[node]) {
      temp[node] = true

      for (const dependency of subgraph[node]) {
        visit(dependency)
      }

      temp[node] = false
      visited[node] = true
      order.push(node)
    }
  }

  // Visit each node
  columnNames.forEach((col) => {
    if (!visited[col]) {
      visit(col)
    }
  })

  // Reverse to get correct deletion order (dependencies first)
  return order.reverse()
}
