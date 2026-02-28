import { useCallback, useEffect, useState } from "react"
import { useSqlite } from "./use-sqlite"
import { TreeNodeType } from "@/packages/core/types/ITreeNode"
import { uuidv7 } from "@/lib/utils"
import { useCurrentPathInfo } from "./use-current-pathinfo"

export const useDataView = () => {
  const { sqlite } = useSqlite()
  const { space } = useCurrentPathInfo()

  const createDataView = async (id: string, createViewSql: string) => {
    await sqlite?.dataView.createDataView(id, createViewSql)
  }

  const isDataViewExist = async (id: string) => {
    return await sqlite?.dataView.isDataViewExist(id)
  }

  const createTempDataView = async (id: string, createViewSql: string) => {
    return await sqlite?.dataView.createDataView(id, createViewSql, true)
  }

  const createCustomPropertyDataView = async (
    propertyKey: string,
    propertyValue: any
  ) => {
    // create tree node first
    const id = uuidv7().split("-").join("")
    await sqlite?.tree.addNode({
      id,
      name: `DataView - ${propertyValue}`,
      type: TreeNodeType.Dataview,
    })
    const query = generateCustomPropertyQuery(propertyKey, propertyValue, space)
    await createDataView(id, query)
    return id // return the node ID for navigation
  }

  return {
    createDataView,
    createCustomPropertyDataView,
    createTempDataView,
    isDataViewExist,
  }
}

export const useDataViewById = (id?: string) => {
  const [isDataViewExist, setIsDataViewExist] = useState(false)
  const { sqlite } = useSqlite()

  const reload = useCallback(() => {
    if (id) {
      sqlite?.dataView.isDataViewExist(id).then(setIsDataViewExist)
    }
  }, [id])
  useEffect(() => {
    reload()
  }, [id, reload])

  return {
    isDataViewExist,
    reload,
  }
}

/**
 * generate custom property query
 * @param propertyKey - property name
 * @param propertyValue - property value
 * @returns SQL query string
 */
const generateCustomPropertyQuery = (
  propertyKey: string,
  propertyValue: any,
  space: string
): string => {
  // handle different types of values
  let whereCondition: string
  if (typeof propertyValue === "string") {
    whereCondition = `d.${propertyKey} = '${propertyValue.replace(/'/g, "''")}'` // Escape single quotes
  } else if (typeof propertyValue === "number") {
    whereCondition = `d.${propertyKey} = ${propertyValue}`
  } else if (typeof propertyValue === "boolean") {
    whereCondition = `d.${propertyKey} = ${propertyValue ? 1 : 0}`
  } else if (propertyValue === null) {
    whereCondition = `d.${propertyKey} IS NULL`
  } else {
    // other types convert to string and escape single quotes
    whereCondition = `d.${propertyKey} = '${String(propertyValue).replace(/'/g, "''")}'`
  }

  return `
SELECT
  t.name as title,
  d.id as id,
  '/' || t.id as doc_pathname, -- [doc_pathname:url]
  d.markdown as markdown,
  d.created_at as created_at,
  d.updated_at as updated_at,
  d.${propertyKey} as ${propertyKey}
FROM
  eidos__tree t
  JOIN eidos__docs d ON t.id = d.id
WHERE
  ${whereCondition};
    `.trim()
}
