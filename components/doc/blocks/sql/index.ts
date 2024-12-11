import { LexicalEditor } from "lexical"
import { DocBlock } from "../interface"
import { SQLPlugin, INSERT_SQL_COMMAND } from "./plugin"
import { $createSQLNode, SQLNode, SQL_NODE_TRANSFORMER } from "./node"

export default {
    name: "SQL",
    node: SQLNode,
    plugin: SQLPlugin,
    icon: "Sheet",
    keywords: ["sql", "query", "database"],
    onSelect: (editor: LexicalEditor) => editor.dispatchCommand(INSERT_SQL_COMMAND, 'SELECT date();'),
    command: {
        create: INSERT_SQL_COMMAND,
    },
    transformers: [SQL_NODE_TRANSFORMER],
    createNode: $createSQLNode,
} as DocBlock 