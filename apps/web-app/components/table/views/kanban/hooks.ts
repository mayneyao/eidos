import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"
import { useTableOperation } from "@/apps/web-app/hooks/use-table"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"
import type {
    EidosDataEventChannelMsg} from "@/lib/const";
import {
    EidosDataEventChannelMsgType,
    EidosDataEventChannelName
} from "@/lib/const"
import { FieldType } from "@/packages/core/fields/const"
import type { SelectProperty } from "@/packages/core/fields/select"
import { transformSql } from "@/packages/core/sqlite/sql-parser"
import type { IView } from "@/packages/core/types/IView"
import { getRawTableNameById } from "@/lib/utils"
import type { IField } from "@/packages/core/types/IField"
import { useCallback, useContext, useEffect, useMemo, useState } from "react"
import { uuidv7 } from "@/lib/utils"
import { TableContext } from "../../hooks"

export type KanbanItem = {
    id: string
    status: string
    [key: string]: any
}

export type StatusCount = {
    status: string
    count: number
    color?: string
}


export const NULL_STATUS = "EIDOS_NULL_STATUS"

export const useKanbanViewData = (view: IView) => {
    const { table_id: tableId, query, properties } = view
    const tableName = getRawTableNameById(tableId)
    const { space } = useContext(TableContext)
    const { sqlite } = useSqlite()
    const { setRows } = useSqliteStore()
    const [items, setItems] = useState<KanbanItem[]>([])
    const [statusCounts, setStatusCounts] = useState<StatusCount[]>([])
    const [loading, setLoading] = useState(false)
    const { nameRawIdMap, fieldRawColumnNameFieldMap, uiColumns } = useUiColumns(tableName, space)

    const groupByField = properties?.groupByField || 'status'

    const groupByFieldInstance = fieldRawColumnNameFieldMap[groupByField]
    const sql = useMemo(() => {
        const defaultQuery = `select * from ${tableName}`
        const q = query.trim().length ? query : defaultQuery
        const sql = transformSql(q, tableName, nameRawIdMap)
        return sql
    }, [query, tableName, nameRawIdMap])

    const fetchStatusCounts = useCallback(async () => {
        if (!sqlite || !tableName) return

        const countSql = `
            SELECT 
                CASE
                    WHEN ${groupByField} IS NULL OR ${groupByField} = '' THEN '${NULL_STATUS}'
                    ELSE ${groupByField}
                END as status,
                COUNT(*) as count 
            FROM (${sql}) as filtered_data
            GROUP BY ${groupByField}
            ORDER BY count DESC
        `
        try {
            const counts: StatusCount[] = await sqlite.sql2`${countSql}`
            if (groupByFieldInstance?.type === FieldType.Select) {
                // combo statusCounts and groupByFieldInstance.options
                const options = (groupByFieldInstance as IField<SelectProperty>).property.options
                const statusCountsWithOptions: StatusCount[] = options.map(option => {
                    const count = counts.find(count => count.status === option.name)
                    return {
                        status: option.name,
                        count: count?.count || 0,
                        color: option.color
                    }
                })
                const nullStatus = counts.find(count => count.status === NULL_STATUS) || { count: 0 }
                if (!statusCountsWithOptions.some(item => item.status === NULL_STATUS) && nullStatus.count > 0) {
                    statusCountsWithOptions.unshift({
                        status: NULL_STATUS,
                        count: nullStatus.count,
                    })
                }
                setStatusCounts(statusCountsWithOptions)
            } else {
                console.warn("groupByField is not a select field", {
                    fieldRawColumnNameFieldMap,
                    groupByFieldInstance,
                    groupByField,
                    uiColumns
                })
                setStatusCounts(counts)
            }
        } catch (error) {
            console.error('Error fetching status counts:', error)
        }
    }, [sqlite, tableName, groupByField, groupByFieldInstance, fieldRawColumnNameFieldMap, uiColumns, sql])



    const updateItemStatus = async (itemId: string, newStatus: string) => {
        const oldStatus = items.find(item => item.id === itemId)?.status
        if (oldStatus === newStatus) {
            return
        }
        setItems((prevItems) =>
            prevItems.map((item) =>
                item.id === itemId ? { ...item, [groupByField]: newStatus, status: newStatus } : item
            )
        )
        await sqlite?._table(tableId).rows.update(itemId, { [groupByField]: newStatus === NULL_STATUS ? null : newStatus }, {
            useFieldId: true
        })
        await fetchStatusCounts()

    }

    useEffect(() => {
        if (sqlite && nameRawIdMap.size && tableName) {
            setLoading(true)
            Promise.all([
                sqlite.sql2`${sql}`,
                fetchStatusCounts()
            ]).then(([data]) => {
                setRows(tableId, data)
                setItems(
                    data.map((item: any) => ({
                        id: item._id,
                        status: item[groupByField] || NULL_STATUS,
                        ...item,
                    }))
                )
                setLoading(false)
            })
        }
    }, [sqlite, sql, tableName, view.id, nameRawIdMap, setRows, tableId, groupByField])

    useEffect(() => {
        const bc = new BroadcastChannel(EidosDataEventChannelName)
        const handleMsg = async (e: MessageEvent<EidosDataEventChannelMsg>) => {
            const { type, payload } = e.data
            if (
                type === EidosDataEventChannelMsgType.DataUpdateSignalType &&
                payload.table === tableName
            ) {
                const { _new, _old } = payload
                const isUpdate = _new && _old
                const isDelete = !_new && _old
                const isCreate = _new && !_old

                if (isUpdate) {
                    setItems((prevItems) =>
                        prevItems.map((item) =>
                            item.id === _new._id ? { ...item, [groupByField]: _new[groupByField], status: _new[groupByField] || NULL_STATUS } : item
                        )
                    )
                } else if (isDelete) {
                    setItems((prevItems) =>
                        prevItems.filter((item) => item.id !== _old._id)
                    )
                } else if (isCreate) {
                    setItems((prevItems) => [...prevItems, { ..._new, id: _new._id, status: _new[groupByField] || NULL_STATUS }])
                }
                await fetchStatusCounts()
            }
        }
        bc.addEventListener("message", handleMsg)
        return () => {
            bc.removeEventListener("message", handleMsg)
            bc.close()
        }
    }, [tableName, groupByField, fetchStatusCounts])

    return {
        items,
        loading,
        statusCounts,
        updateItemStatus: updateItemStatus,
    }
}

export const useKanbanItemOperations = (
    tableId: string,
    space: string,
    groupByField?: string
) => {
    const { addRow } = useTableOperation(getRawTableNameById(tableId), space)

    const createItem = async (title: string, status: string) => {
        if (!title || !groupByField) return

        return await addRow(
            uuidv7(),
            {
                title: title,
                [groupByField]: status,
            },
            {
                useFieldId: true,
            }
        )
    }
    return {
        createItem,
    }
}

