import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface AvatarListProps {
  nameList: string[]
}
export const AvatarList = ({ nameList }: AvatarListProps) => {
  return (
    <div className="flex items-center justify-center gap-2">
      {nameList.map((name, index) => {
        return (
          <Avatar
            key={index}
            className={cn(
              `z-${index * 10}`,
              "h-8 w-8 cursor-pointer border-2 border-red-300 bg-white shadow-sm"
            )}
          >
            {/* <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" /> */}
            <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
          </Avatar>
        )
      })}
    </div>
  )
}
