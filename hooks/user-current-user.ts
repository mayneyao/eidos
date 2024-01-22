import { useConfigStore } from "@/app/settings/store"

export const useCurrentUser = () => {
  const { profile } = useConfigStore()
  return {
    id: profile.userId,
    name: profile.username,
  }
}
