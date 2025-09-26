import { useConfigStore } from "@/components/settings/stores"

export const useCurrentUser = () => {
  const { profile } = useConfigStore()
  return {
    id: profile.userId,
    name: profile.username,
  }
}
