import { useUserMap } from "@/hooks/use-user-map"
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
  }
  return (
    <div className="not-prose flex items-center gap-2">
      <Avatar className="h-6 w-6">
        <AvatarImage src={user.avatar} />
        <AvatarFallback>{user.name.slice(0, 1)}</AvatarFallback>
      </Avatar>
      {user?.name}
    </div>
  )
}
