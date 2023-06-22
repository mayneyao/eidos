import { useEffect, useState } from "react"

import { getAllDays } from "@/lib/opfs"

export const useAllDays = (spaceName: string) => {
  const [days, setDays] = useState<string[]>([])

  useEffect(() => {
    getAllDays(spaceName).then()
  }, [spaceName])
  return days
}
