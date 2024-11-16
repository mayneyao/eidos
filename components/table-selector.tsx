import { useAllNodes } from "@/hooks/use-nodes"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export const TableSelector = ({
  onSelect,
  value,
}: {
  onSelect?: (tableId: string) => void
  value?: string
}) => {
  const tables = useAllNodes({ type: "table" })

  return (
    <Select onValueChange={onSelect} value={value}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="选择一个表格..." />
      </SelectTrigger>
      <SelectContent>
        {tables.map((table) => (
          <SelectItem key={table.id} value={table.id}>
            {table.name ?? "Untitled"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
