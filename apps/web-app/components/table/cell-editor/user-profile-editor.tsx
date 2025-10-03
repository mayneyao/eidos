import { useUserMap } from "@/apps/web-app/hooks/use-user-map"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface IUserProfileEditorProps {
  value: string
  onChange: (value: string) => void
  isEditing: boolean
}

export const UserProfileEditor = ({ value }: IUserProfileEditorProps) => {
  const { userMap } = useUserMap()
  const user = userMap[value] || {
    name: "unknown",
    avatar: "",
  }
  return (
    <div className="not-prose flex h-full w-full items-center px-1 gap-2">
      <Avatar className="h-6 w-6">
        <AvatarImage src={user.avatar} />
        <AvatarFallback>{user.name.slice(0, 1)}</AvatarFallback>
      </Avatar>
      {user?.name}
    </div>
  )
}
