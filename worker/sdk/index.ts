import { DataSpace } from "../DataSpace"

export interface Eidos {
  space(spaceName: string): DataSpace
  currentSpace: DataSpace
}

export interface EidosTable<T = Record<string, string>> {
  id: string
  name: string
  fieldsMap: T
}
