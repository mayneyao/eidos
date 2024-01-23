import { useState } from "react"

import { useConfigStore } from "@/app/settings/store"

export const useUserMap = () => {
  // for now only one user, when collaboration is ready, we will query user data from database
  const { profile } = useConfigStore()
  const [userMap, setUserMap] = useState({
    [profile.userId!]: {
      name: profile.username,
      avatar: profile.avatar,
    },
  })
  return {
    userMap,
  }
}
