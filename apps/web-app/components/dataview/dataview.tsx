import { useAllDataViewIds } from "@/hooks/use-all-dataview-ids"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"

import { Table } from "../table"
import { DataViewPlaceholder } from "./placeholder"

export const DataView = ({ nodeId }: { nodeId: string }) => {
  const { dataViewIds, reload } = useAllDataViewIds()
  const isDataViewExist = dataViewIds.includes(nodeId)

  const { space } = useCurrentPathInfo()

  if (!isDataViewExist) {
    return <DataViewPlaceholder nodeId={nodeId} onCreated={reload} />
  }

  return <Table tableName={`vw_${nodeId}`} space={space} />
}
