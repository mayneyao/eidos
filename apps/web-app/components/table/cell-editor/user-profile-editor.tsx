import { useUserMap } from "@/apps/web-app/hooks/use-user-map"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

import type { CellEditorProps } from "./types"

interface IUserProfileEditorProps extends CellEditorProps<string> {}

export const UserProfileEditor = ({
  value,
  layout = "flow",
}: IUserProfileEditorProps) => {
  const { userMap } = useUserMap()
  const user = userMap[value] || {
    name: "unknown",
    avatar: "",
  }

  const containerClasses = cn(
    "flex items-center",
    layout === "fill" && "absolute inset-0 px-2",
    layout === "inline" && "inline-flex px-2",
    layout === "flow" && "relative px-2 w-full h-full"
  )

  return (
    <div className={containerClasses}>
      <div className="not-prose flex items-center gap-2 text-sm">
        <Avatar className="h-6 w-6">
          <AvatarImage src={user.avatar} />
          <AvatarFallback>{user.name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        {user?.name}
      </div>
    </div>
  )
}
