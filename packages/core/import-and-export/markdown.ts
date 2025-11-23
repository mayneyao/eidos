import { uuidv7 } from "@/lib/utils"

import type { DataSpace } from "../data-space"
import { BaseImportAndExport } from "./base"

export class MarkdownImportAndExport extends BaseImportAndExport {
  async import(file: {
    name: string
    content: string
  }, dataSpace: DataSpace): Promise<string> {
    const nodeId = uuidv7().split("-").join("")
    const nodeName = file.name.replace(/\.[^/.]+$/, "")
    await dataSpace.createOrUpdateDocWithMarkdown(
      nodeId,
      file.content,
      undefined,
      nodeName
    )
    return nodeId
  }

  async export(nodeId: string, dataSpace: DataSpace): Promise<string> {
    const node = await dataSpace.tree.getNode(nodeId)
    const markdown = await dataSpace.getDocMarkdown(nodeId)
    return markdown ?? ""
  }
}
