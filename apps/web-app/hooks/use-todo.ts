import { useCallback } from "react"
import type { DataSpace } from "@eidos.space/core/data-space"

import { TodoTableName } from "@/packages/core/sqlite/const"
import type { TodoListItem } from "@/components/doc/plugins/TodoPlugin"

export const useTodo = (
  sqlite: DataSpace | null,
  docId: string | undefined
) => {
  const addTodo = useCallback(
    async (item: TodoListItem) => {
      if (!sqlite || !docId) return
      await sqlite.sql`INSERT INTO ${Symbol(
        TodoTableName
      )} (content, done, doc_id, list_id, node_key) VALUES (${item.text}, ${
        item.checked
      }, ${docId},${item.listNodeKey}, ${item.nodeKey});`
    },
    [sqlite, docId]
  )

  const updateTodo = useCallback(
    async (item: TodoListItem) => {
      if (!sqlite || !docId) return
      await sqlite.sql`UPDATE ${Symbol(TodoTableName)} SET content = ${
        item.text
      }, done = ${item.checked} WHERE node_key = ${item.nodeKey} AND doc_id = ${docId};`
    },
    [sqlite, docId]
  )

  const deleteTodo = useCallback(
    async (item: TodoListItem) => {
      if (!sqlite || !docId) return
      await sqlite.sql`DELETE FROM ${Symbol(TodoTableName)} WHERE node_key = ${
        item.nodeKey
      } AND doc_id = ${docId};`
    },
    [sqlite, docId]
  )

  const deleteByListId = useCallback(
    async (listId: string) => {
      if (!sqlite || !docId) return
      await sqlite.sql`DELETE FROM ${Symbol(
        TodoTableName
      )} WHERE list_id = ${listId} AND doc_id = ${docId};`
    },
    [sqlite, docId]
  )

  return {
    addTodo,
    updateTodo,
    deleteTodo,
    deleteByListId,
  }
}
