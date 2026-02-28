import type { DataSpace } from "../data-space"

export abstract class BaseImportAndExport {
  abstract import(
    textFileLike: {
      name: string
      content: string
    },
    dataSpace: DataSpace
  ): Promise<string>
  abstract export(nodeId: string, dataSpace: DataSpace): Promise<string>
}
