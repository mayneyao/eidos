import { uuidv7 } from "@/lib/utils"

import { DataSpace } from "../DataSpace"
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
    const node = await dataSpace.getTreeNode(nodeId)
    const markdown = await dataSpace.getDocMarkdown(nodeId)
    return markdown
  }
}
