import { useState } from "react"

import { useConfigStore } from "@/components/settings/stores"

export const useUserMap = () => {
  // for now only one user, when collaboration is ready, we will query user data from database
  const { profile } = useConfigStore()
  const [userMap, setUserMap] = useState(() => {
    const userId = profile.userId
    if (!userId) {
      return {}
    }
    return {
      [userId]: {
        name: profile.username || "unknown",
        avatar: profile.avatar,
      },
    }
  })
  return {
    userMap,
  }
}
