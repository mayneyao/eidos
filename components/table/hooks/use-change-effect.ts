import { useEffect, useRef } from "react"

// avoid confusing with ahooks useUpdateEffect
function useChangeEffect(callback: () => void, dependencies: any[]) {
  const firstRenderRef = useRef(true)

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }

    return callback()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback, ...dependencies])
}

export default useChangeEffect
