import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import { ElementFormatType, NodeKey } from "lexical"

import { getRawTableNameById } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Table } from "@/components/table"

type DatabaseTableComponentProps = Readonly<{
  className: Readonly<{
    base: string
    focus: string
  }>
  format: ElementFormatType | null
  nodeKey: NodeKey
  id: string
}>

export function DatabaseTableComponent({
  className,
  format,
  nodeKey,
  id,
}: DatabaseTableComponentProps) {
  const { space } = useCurrentPathInfo()
  const rawTableName = getRawTableNameById(id)

  return (
    <BlockWithAlignableContents
      className={className}
      format={format}
      nodeKey={nodeKey}
    >
      <div className="border max-h-[300px] overflow-y-auto">
        <Table tableName={rawTableName} space={space} isEmbed />
      </div>
    </BlockWithAlignableContents>
  )
}
