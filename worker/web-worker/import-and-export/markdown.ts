import { uuidv4 } from "@/lib/utils"

import { DataSpace } from "../DataSpace"
import { BaseImportAndExport } from "./base"

export class MarkdownImportAndExport extends BaseImportAndExport {
  async import(file: File, dataSpace: DataSpace): Promise<string> {
    const nodeId = uuidv4().split("-").join("")
    const content = await file.text()
    const nodeName = file.name.replace(/\.[^/.]+$/, "")
    await dataSpace.createOrUpdateDocWithMarkdown(
      nodeId,
      content,
      undefined,
      nodeName
    )
    return nodeId
  }

  async export(nodeId: string, dataSpace: DataSpace): Promise<File> {
    const node = await dataSpace.getTreeNode(nodeId)
    const markdown = await dataSpace.getDocMarkdown(nodeId)
    const blob = new Blob([markdown], { type: "text/markdown" })
    return new File([blob], `${node?.name || nodeId}.md`)
  }
}
