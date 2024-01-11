import { useCallback } from "react"
import { DataSpace } from "@/worker/web-worker/DataSpace"

import { TodoListItem } from "@/types/todo"
import { TodoTableName } from "@/lib/sqlite/const"

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
      }, done = ${item.checked} WHERE node_key = ${
        item.nodeKey
      } AND doc_id = ${docId};`
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
