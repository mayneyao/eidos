import { useCallback, useEffect, useState } from "react"
import { useSqlite } from "./use-sqlite"
import { TreeNodeType } from "@/packages/core/types/ITreeNode"
import { uuidv7 } from "@/lib/utils"

export const useDataView = () => {
    const { sqlite } = useSqlite()

    const createDataView = async (id: string, createViewSql: string) => {
        await sqlite?.dataView.createDataView(id, createViewSql)
    }

    const isDataViewExist = async (id: string) => {
        return await sqlite?.dataView.isDataViewExist(id)
    }

    const getViewColumns = async (id: string) => {
        return await sqlite?.dataView.getViewColumns(id)
    }

    const createTempDataView = async (id: string, createViewSql: string) => {
        return await sqlite?.dataView.createDataView(id, createViewSql, true)
    }

    const createCustomPropertyDataView = async (propertyKey: string, propertyValue: any) => {
        // create tree node first
        const id = uuidv7().split("-").join("")
        await sqlite?.tree.addNode({
            id,
            name: `New View - ${propertyValue}`,
            type: TreeNodeType.Dataview,
        })
        const query = generateCustomPropertyQuery(propertyKey, propertyValue)
        return await createDataView(id, query)
    }

    return {
        createDataView,
        createCustomPropertyDataView,
        createTempDataView,
        isDataViewExist,
        getViewColumns
    }
}

export const useDataViewById = (id?: string) => {
    const [isDataViewExist, setIsDataViewExist] = useState(false)
    const [viewColumns, setViewColumns] = useState<any[]>([])
    const { sqlite } = useSqlite()

    const reload = useCallback(() => {
        if (id) {
            sqlite?.dataView.isDataViewExist(id).then(setIsDataViewExist)
            sqlite?.dataView.getViewColumns(id).then(setViewColumns)
        }
    }, [id])
    // console.log("viewColumns", { id, viewColumns })
    useEffect(() => {
        reload()
    }, [id, reload])

    return {
        isDataViewExist,
        viewColumns,
        reload
    }
}

/**
 * generate custom property query
 * @param propertyKey - property name
 * @param propertyValue - property value
 * @returns SQL query string
 */
const generateCustomPropertyQuery = (propertyKey: string, propertyValue: any): string => {
    // handle different types of values
    let whereCondition: string
    if (typeof propertyValue === 'string') {
        whereCondition = `d.${propertyKey} = '${propertyValue.replace(/'/g, "''")}'` // 转义单引号
    } else if (typeof propertyValue === 'number') {
        whereCondition = `d.${propertyKey} = ${propertyValue}`
    } else if (typeof propertyValue === 'boolean') {
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
