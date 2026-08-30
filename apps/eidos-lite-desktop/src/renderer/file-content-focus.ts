import { useEffect, useRef } from "react"

export function useFileContentFocusRequest(
  focusRequestToken: number,
  focus: () => void
): void {
  const acceptedTokenRef = useRef(focusRequestToken)
  const focusRef = useRef(focus)
  focusRef.current = focus

  useEffect(() => {
    if (acceptedTokenRef.current === focusRequestToken) return
    acceptedTokenRef.current = focusRequestToken
    focusRef.current()
  }, [focusRequestToken])
}
