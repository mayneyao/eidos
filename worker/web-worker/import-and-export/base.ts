import { DataSpace } from "../DataSpace"

export abstract class BaseImportAndExport {
  abstract import(file: File, dataSpace: DataSpace): Promise<string>
  abstract export(nodeId: string, dataSpace: DataSpace): Promise<File>
}
