import type { DocActionMeta, FileActionMeta, IExtension } from "@/packages/core/types/IExtension"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { generateIdV7 } from "@/lib/utils"

import { useExtension } from "@/apps/web-app/hooks/use-extension"
import { useExtensionSidebarStore } from "@/apps/web-app/store/extension-store"

// Script templates
import emptyScriptTemplate from "./templates/script/empty.ts?raw"
import tableActionTemplate from "./templates/script/table-action.ts?raw"
import docActionTemplate from "./templates/script/doc-action.ts?raw"
import toolTemplate from "./templates/script/tool.ts?raw"
import udfTemplate from "./templates/script/udf.ts?raw"
import fileActionTemplate from "./templates/script/file-action.ts?raw"

// Block templates
import { extractConstant, blockCodeCompile, scriptCodeCompile } from "@eidos.space/v3"
import emptyBlockTemplate from "./templates/block/empty.tsx?raw"
import extNodeTemplate from "./templates/block/ext-node.tsx?raw"
import tableViewTemplate from "./templates/block/table-view.tsx?raw"
import fileHandlerTemplate from "./templates/block/file-handler.tsx?raw"


export const useNewExtension = () => {
  const { addExtension } = useExtension()
  const { navigate } = useRouterAdapter()
  const { space } = useCurrentPathInfo()
  const { setFocusedExtensionId } = useExtensionSidebarStore()

  const handleCreateNewExtension = async (
    template: "fileHandler" | "tool" | "udf" | "tableAction" | "docAction" | "fileAction" | "tableView" | "extNode" | "emptyScript" | "emptyBlock" = "tool",
    type: "script" | "block" = template === "tableView" || template === "extNode" || template === "emptyBlock" || template === "fileHandler" ? "block" : "script"
  ) => {
    const newScriptId = generateIdV7()
    const shortSlug = newScriptId.slice(-8)

    const createExtension = async (): Promise<IExtension> => {
      switch (template) {
        case "tool": {
          const [code, meta] = await Promise.all([
            scriptCodeCompile(toolTemplate),
            extractConstant(toolTemplate, "meta")
          ])
          return {
            id: newScriptId,
            slug: `tool-${shortSlug}`,
            name: meta?.tool?.name || `New Tool - ${shortSlug}`,
            type: type,
            description: meta?.tool?.description || "Tool Description",
            version: "0.0.1",
            code,
            ts_code: toolTemplate,
            meta,
            enabled: true

          }
        }

        case "udf": {
          const [code, meta] = await Promise.all([
            scriptCodeCompile(udfTemplate),
            extractConstant(udfTemplate, "meta")
          ])
          return {
            id: newScriptId,
            slug: `udf-${shortSlug}`,
            name: meta?.udf?.name || `myTwice`,
            type: type,
            description: meta?.udf?.name || "twice the input",
            version: "0.0.1",
            code,
            ts_code: udfTemplate,
            meta,
            enabled: true

          }
        }

        case "tableAction": {
          const [code, meta] = await Promise.all([
            scriptCodeCompile(tableActionTemplate),
            extractConstant(tableActionTemplate, "meta")
          ])
          return {
            id: newScriptId,
            slug: `table-action-${shortSlug}`,
            name: meta?.tableAction?.name || `Toggle Checked`,
            type: type,
            description: meta?.tableAction?.description || "Toggles the checked status of the selected record",
            version: "0.0.1",
            code,
            ts_code: tableActionTemplate,
            meta,
            enabled: true
          }
        }

        case "docAction": {
          const [code, meta] = await Promise.all([
            scriptCodeCompile(docActionTemplate),
            extractConstant(docActionTemplate, "meta")
          ])
          const docMeta = meta as DocActionMeta
          return {
            id: newScriptId,
            slug: `doc-action-${shortSlug}`,
            name: docMeta?.docAction?.name || `New Doc Action - ${shortSlug}`,
            type: type,
            description: docMeta?.docAction?.description || "Document action extension",
            version: "0.0.1",
            code,
            ts_code: docActionTemplate,
            meta: docMeta,
            enabled: true
          }
        }

        case "fileAction": {
          const [code, meta] = await Promise.all([
            scriptCodeCompile(fileActionTemplate),
            extractConstant(fileActionTemplate, "meta")
          ])
          const fileActionMeta = meta as FileActionMeta
          return {
            id: newScriptId,
            slug: `file-action-${shortSlug}`,
            name: fileActionMeta?.fileAction?.name || `New File Action - ${shortSlug}`,
            type: type,
            description: fileActionMeta?.fileAction?.description || "File action extension",
            version: "0.0.1",
            code,
            ts_code: fileActionTemplate,
            meta: fileActionMeta,
            enabled: true
          }
        }

        case "tableView": {
          const [code, meta] = await Promise.all([
            blockCodeCompile(tableViewTemplate),
            extractConstant(tableViewTemplate, "meta")
          ])
          return {
            id: newScriptId,
            slug: `table-view-${shortSlug}`,
            name: meta?.tableView?.title || `New Table View - ${shortSlug}`,
            type: type,
            description: meta?.tableView?.description || "Custom table view",
            version: "0.0.1",
            code,
            ts_code: tableViewTemplate,
            meta,
            enabled: true
          }
        }

        case "extNode": {
          const [code, meta] = await Promise.all([
            blockCodeCompile(extNodeTemplate),
            extractConstant(extNodeTemplate, "meta")
          ])
          return {
            id: newScriptId,
            slug: `ext-node-${shortSlug}`,
            name: meta?.extNode?.title || `New Ext Node - ${shortSlug}`,
            type: "block",
            description: meta?.extNode?.description || "Custom extension node",
            version: "0.0.1",
            code,
            ts_code: extNodeTemplate,
            meta,
            enabled: true
          }
        }


        case "fileHandler": {
          const [code, meta] = await Promise.all([
            blockCodeCompile(fileHandlerTemplate),
            extractConstant(fileHandlerTemplate, "meta")
          ])
          return {
            id: newScriptId,
            slug: `file-handler-${shortSlug}`,
            name: meta?.fileHandler?.title || `New File Handler - ${shortSlug}`,
            type: "block",
            description: meta?.fileHandler?.description || "Custom file handler",
            version: "0.0.1",
            code,
            ts_code: fileHandlerTemplate,
            meta,
            enabled: true
          }
        }

        case "emptyScript": {
          const code = await scriptCodeCompile(emptyScriptTemplate)
          return {
            id: newScriptId,
            slug: `script-${shortSlug}`,
            name: `New Script - ${shortSlug}`,
            type: type,
            description: "Empty script extension",
            version: "0.0.1",
            code,
            ts_code: emptyScriptTemplate,
            meta: undefined,
            enabled: true
          }
        }

        case "emptyBlock": {
          const code = await blockCodeCompile(emptyBlockTemplate)
          return {
            id: newScriptId,
            slug: `block-${shortSlug}`,
            name: `New Block - ${shortSlug}`,
            type: type,
            description: "Empty block extension",
            version: "0.0.1",
            code,
            ts_code: emptyBlockTemplate,
            meta: undefined,
            enabled: true
          }
        }

        default:
          throw new Error(`Unknown template: ${template}`)
      }
    }

    const extension = await createExtension()
    await addExtension(extension)

    // Set the focused extension ID to scroll to it in the sidebar
    setFocusedExtensionId(newScriptId)

    navigate(`/extensions/${newScriptId}`)
  }

  return {
    handleCreateNewExtension,
  }
}
