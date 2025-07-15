import type { IExtension } from "@/packages/core/types/IExtension"
import { ScriptExtensionType, BlockExtensionType } from "@/packages/core/types/IExtension"
import { useNavigate } from "react-router-dom"

import { generateId } from "@/lib/utils"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"

import { useExtension } from "../../../../hooks/use-extension"
import mblockTemplate from "./template/new-micro-block?raw"
export const useNewExtension = () => {
  const { addExtension } = useExtension()
  const router = useNavigate()
  const { space } = useCurrentPathInfo()

  const handleCreateNewExtension = async (
    template: "tool" | "udf" | "tableAction" | "tableView" | "extNode" | "emptyScript" | "emptyBlock" = "tool",
    type: "script" | "block" = template === "tableView" || template === "extNode" || template === "emptyBlock" ? "block" : "script"
  ) => {
    const newScriptId = generateId()

    // Tool Script (LLM Tool)
    const toolScript: IExtension = {
      id: newScriptId,
      slug: `tool-${newScriptId}`,
      name: `New Tool - ${newScriptId}`,
      type: type,
      description: "Tool Description",
      version: "0.0.1",
      code: `export const meta = {
  type: "tool",
  funcName: "hello",
  tool: {
    name: "hello",
    description: "This is a hello world tool",
    inputJSONSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
        },
      },
    },
    outputJSONSchema: {
      type: "string",
    },
  },
}

function hello(name) {
  return \`Hello, \${name}!\`
}`,
      ts_code: `export const meta = {
  type: "tool",
  funcName: "hello",
  tool: {
    name: "hello",
    description: "This is a hello world tool",
    inputJSONSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
        },
      },
    },
    outputJSONSchema: {
      type: "string",
    },
  },
}

function hello(name: string) {
  return \`Hello, \${name}!\`
}`,
      meta: {
        type: ScriptExtensionType.Tool,
        funcName: "hello",
        tool: {
          name: "hello",
          description: "This is a hello world tool",
          inputJSONSchema: {
            type: "object",
            properties: {
              name: {
                type: "string",
              },
            },
          },
          outputJSONSchema: {
            type: "object",
            properties: {
              result: {
                type: "string",
              },
            },
          },
        },
      },
    }

    // UDF Script (User-Defined Function)
    const udfScript: IExtension = {
      id: newScriptId,
      slug: `udf-${newScriptId}`,
      name: `myTwice`,
      type: type,
      description: "twice the input",
      version: "0.0.1",
      code: `export const meta = {
  type: "udf",
  funcName: "myTwice",
  udf: {
    name: "myTwice",
    deterministic: true,
  },
}

function myTwice(arg) {
  return arg + arg
}`,
      ts_code: `export const meta = {
  type: "udf",
  funcName: "myTwice",
  udf: {
    name: "myTwice",
    deterministic: true,
  },
}

function myTwice(arg: number) {
  return arg + arg
}`,
      meta: {
        type: ScriptExtensionType.UDF,
        funcName: "myTwice",
        udf: {
          name: "myTwice",
          deterministic: true,
        },
      },
    }

    // Table Action Script
    const tableActionScript: IExtension = {
      id: newScriptId,
      slug: `table-action-${newScriptId}`,
      name: `Toggle Checked`,
      type: type,
      description: "Toggles the checked status of the selected record",
      version: "0.0.1",
      code: `export const meta = {
  type: "tableAction",
  funcName: "toggleChecked",
  tableAction: {
    name: "Toggle Checked Status",
    description: "Toggles the checked status of the selected record",
  },
}

export async function toggleChecked(input, ctx) {
  const { tableId, viewId, rowId } = ctx
  await eidos.currentSpace.table(tableId).rows.update(rowId, {
    checked: !input.checked,
  })
  return {
    success: true,
  }
}`,
      ts_code: `export const meta = {
  type: "tableAction",
  funcName: "toggleChecked",
  tableAction: {
    name: "Toggle Checked Status",
    description: "Toggles the checked status of the selected record",
  },
}

export async function toggleChecked(
  input: Record<string, any>,
  ctx: {
    tableId: string
    viewId: string
    rowId: string
  }
) {
  const { tableId, viewId, rowId } = ctx
  await eidos.currentSpace.table(tableId).rows.update(rowId, {
    checked: !input.checked,
  })
  return {
    success: true,
  }
}`,
      meta: {
        type: ScriptExtensionType.TableAction,
        funcName: "toggleChecked",
        tableAction: {
          name: "Toggle Checked Status",
          description: "Toggles the checked status of the selected record",
        },
      },
    }

    // Table View Block Extension
    const tableViewBlock: IExtension = {
      id: newScriptId,
      slug: `table-view-${newScriptId}`,
      name: `New Table View - ${newScriptId}`,
      type: type,
      description: "Custom table view",
      version: "0.0.1",
      code: `export const meta = {
  type: "tableView",
  componentName: "MyListView",
  tableView: {
    title: "List View",
    type: "list",
    description: "This is a list view",
  },
}

import { useState, useEffect } from "react"

const getRows = async (ctx) => {
  const rows = await eidos.currentSpace.table(ctx.tableId).rows.query(
    {},
    {
      viewId: ctx.viewId,
    }
  )
  return rows
}

export function MyListView({ ctx }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    getRows(ctx).then((rows) => {
      setRows(rows)
    })
  }, [ctx])

  return (
    <div>
      {rows.map((row) => (
        <div key={row.id}>{row.title}</div>
      ))}
    </div>
  )
}`,
      ts_code: mblockTemplate,
      meta: {
        type: BlockExtensionType.TableView,
        componentName: "MyListView",
        tableView: {
          title: "List View",
          type: "list",
          description: "This is a list view",
        },
      },
    }

    // Extension Node Block Extension
    const extNodeBlock: IExtension = {
      id: newScriptId,
      slug: `ext-node-${newScriptId}`,
      name: `New Ext Node - ${newScriptId}`,
      type: "block",
      description: "Custom extension node",
      version: "0.0.1",
      code: ``,
      ts_code: `import { useState, useEffect } from "react"

export const meta = {
  type: "extNode",
  componentName: "MyExtNode",
  extNode: {
    title: "My Extension Node",
    description: "This is a custom extension node",
    type: "custom",
  },
}

export function MyExtNode() {
  const [content, setContent] = useState("")
  const nodeId = window.location.pathname.split('/')[1]

  useEffect(() => {
    eidos.currentSpace.extNode.getText(nodeId).then((text) => {
      setContent(text || "")
    })
  }, [nodeId])

  const handleSave = async (newContent) => {
    await eidos.currentSpace.extNode.setText(nodeId, newContent)
    setContent(newContent)
  }

  return (
    <div className="p-4">
      <h1>Custom Extension Node [{nodeId}]</h1>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={(e) => handleSave(e.target.value)}
        className="w-full h-64 p-2 border rounded"
        placeholder="Enter your content here..."
      />
    </div>
  )
}`,
      meta: {
        type: BlockExtensionType.ExtNode,
        componentName: "MyExtNode",
        extNode: {
          title: "My Extension Node",
          description: "This is a custom extension node",
          type: "custom",
        },
      },
    }

    // Empty Script Extension
    const emptyScript: IExtension = {
      id: newScriptId,
      slug: `script-${newScriptId}`,
      name: `New Script - ${newScriptId}`,
      type: type,
      description: "Empty script extension",
      version: "0.0.1",
      code: ``,
      ts_code: ``,
      meta: undefined,
    }

    // Empty Block Extension
    const emptyBlock: IExtension = {
      id: newScriptId,
      slug: `block-${newScriptId}`,
      name: `New Block - ${newScriptId}`,
      type: type,
      description: "Empty block extension",
      version: "0.0.1",
      code: ``,
      ts_code: ``,
      meta: undefined,
    }

    const templateMap = {
      tool: toolScript,
      udf: udfScript,
      tableAction: tableActionScript,
      tableView: tableViewBlock,
      extNode: extNodeBlock,
      emptyScript: emptyScript,
      emptyBlock: emptyBlock,
    }

    const extension = templateMap[template]
    await addExtension(extension)
    router(`/${space}/extensions/${newScriptId}`)
  }

  return {
    handleCreateNewExtension,
  }
}
