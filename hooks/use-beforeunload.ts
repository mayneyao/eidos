import { useEffect } from "react"

export const useBeforeunload = (handler: () => void) => {
  useEffect(() => {
    const handleBeforeunload = (event: BeforeUnloadEvent) => {
      handler()
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeunload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeunload)
    }
  }, [handler])
}
