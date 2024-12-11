import { LexicalEditor } from "lexical"
import { DocBlock } from "../interface"
import { SyncBlockPlugin, INSERT_SYNC_BLOCK_COMMAND } from "./plugin"
import { $createSyncBlockNode, SyncBlockNode } from "./node"

export default {
  name: "SyncBlock",
  node: SyncBlockNode,
  plugin: SyncBlockPlugin,
  icon: "Link",
  keywords: ["sync", "block", "reference"],
  onSelect: (editor: LexicalEditor) => editor.dispatchCommand(INSERT_SYNC_BLOCK_COMMAND, ''),
  command: {
    create: INSERT_SYNC_BLOCK_COMMAND,
  },
  createNode: $createSyncBlockNode,
  hiddenInMenu: true,
} as DocBlock 