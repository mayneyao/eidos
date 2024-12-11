import { LexicalEditor } from "lexical"
import { DocBlock } from "../interface"
import { DatabaseTablePlugin, INSERT_DATABASE_TABLE_COMMAND } from "./plugin"
import { $createDatabaseTableNode, DatabaseTableNode } from "./node"

export default {
  name: "DatabaseTable",
  node: DatabaseTableNode,
  plugin: DatabaseTablePlugin,
  icon: "Table",
  keywords: ["database", "table", "embed"],
  onSelect: (editor: LexicalEditor) => {
    const id = prompt("Enter Database Table ID:")
    if (id) {
      editor.dispatchCommand(INSERT_DATABASE_TABLE_COMMAND, { id })
    }
  },
  command: {
    create: INSERT_DATABASE_TABLE_COMMAND,
  },
  createNode: $createDatabaseTableNode,
} as DocBlock 