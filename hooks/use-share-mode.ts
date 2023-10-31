import { useEffect, useState } from "react"

export const useShareMode = () => {
  const [isShareMode, setIsShareMode] = useState(false)

  useEffect(() => {
    const isShare =
      window.location.pathname.split("/").filter(Boolean)[0] === "share"
    setIsShareMode(isShare)
  }, [])

  return {
    isShareMode,
  }
}
