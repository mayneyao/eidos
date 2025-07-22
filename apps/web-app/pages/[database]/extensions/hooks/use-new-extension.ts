import type { IExtension } from "@/packages/core/types/IExtension"
import { ScriptExtensionType, BlockExtensionType } from "@/packages/core/types/IExtension"
import { useNavigate } from "react-router-dom"

import { generateIdV7 } from "@/lib/utils"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"

import { useExtension } from "@/apps/web-app/hooks/use-extension"

// Script templates
import toolTemplate from "./templates/script/tool.ts?raw"
import udfTemplate from "./templates/script/udf.ts?raw"
import tableActionTemplate from "./templates/script/table-action.ts?raw"
import emptyScriptTemplate from "./templates/script/empty.ts?raw"

// Block templates
import tableViewTemplate from "./templates/block/table-view.tsx?raw"
import extNodeTemplate from "./templates/block/ext-node.tsx?raw"
import emptyBlockTemplate from "./templates/block/empty.tsx?raw"
import { blockCodeCompile, scriptCodeCompile } from "@/packages/v3/script-compiler"



export const useNewExtension = () => {
  const { addExtension } = useExtension()
  const router = useNavigate()
  const { space } = useCurrentPathInfo()

  const handleCreateNewExtension = async (
    template: "tool" | "udf" | "tableAction" | "tableView" | "extNode" | "emptyScript" | "emptyBlock" = "tool",
    type: "script" | "block" = template === "tableView" || template === "extNode" || template === "emptyBlock" ? "block" : "script"
  ) => {
    const newScriptId = generateIdV7()
    const shortSlug = newScriptId.slice(-8)

    // Tool Script (LLM Tool)
    const toolScript: IExtension = {
      id: newScriptId,
      slug: `tool-${shortSlug}`,
      name: `New Tool - ${shortSlug}`,
      type: type,
      description: "Tool Description",
      version: "0.0.1",
      code: await scriptCodeCompile(toolTemplate),
      ts_code: toolTemplate,
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
      slug: `udf-${shortSlug}`,
      name: `myTwice`,
      type: type,
      description: "twice the input",
      version: "0.0.1",
      code: await scriptCodeCompile(udfTemplate),
      ts_code: udfTemplate,
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
      slug: `table-action-${shortSlug}`,
      name: `Toggle Checked`,
      type: type,
      description: "Toggles the checked status of the selected record",
      version: "0.0.1",
      code: await scriptCodeCompile(tableActionTemplate),
      ts_code: tableActionTemplate,
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
      slug: `table-view-${shortSlug}`,
      name: `New Table View - ${shortSlug}`,
      type: type,
      description: "Custom table view",
      version: "0.0.1",
      code: await blockCodeCompile(tableViewTemplate),
      ts_code: tableViewTemplate,
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
      slug: `ext-node-${shortSlug}`,
      name: `New Ext Node - ${shortSlug}`,
      type: "block",
      description: "Custom extension node",
      version: "0.0.1",
      code: await blockCodeCompile(extNodeTemplate),
      ts_code: extNodeTemplate,
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
      slug: `script-${shortSlug}`,
      name: `New Script - ${shortSlug}`,
      type: type,
      description: "Empty script extension",
      version: "0.0.1",
      code: await scriptCodeCompile(emptyScriptTemplate),
      ts_code: emptyScriptTemplate,
      meta: undefined,
    }

    // Empty Block Extension
    const emptyBlock: IExtension = {
      id: newScriptId,
      slug: `block-${shortSlug}`,
      name: `New Block - ${shortSlug}`,
      type: type,
      description: "Empty block extension",
      version: "0.0.1",
      code: await blockCodeCompile(emptyBlockTemplate),
      ts_code: emptyBlockTemplate,
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
