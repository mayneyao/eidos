import { useSpace } from "@/hooks/use-space"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export const SpaceSelect = ({
  onSelect,
}: {
  onSelect: (space: string) => void
}) => {
  const { spaceList } = useSpace()

  return (
    <Select onValueChange={onSelect}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="space" />
      </SelectTrigger>
      <SelectContent>
        {spaceList.map((space) => (
          <SelectItem value={space} key={space}>
            {space}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
