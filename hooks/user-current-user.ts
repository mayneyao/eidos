import { useConfigStore } from "@/apps/web-app/settings/store"

export const useCurrentUser = () => {
  const { profile } = useConfigStore()
  return {
    id: profile.userId,
    name: profile.username,
  }
}
