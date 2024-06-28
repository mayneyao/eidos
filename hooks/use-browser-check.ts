import { useEffect, useState } from "react"

import * as checker from "@/lib/web/browser"

export const useBrowserCheck = () => {
  const [isBrowserSupported, setIsBrowserSupported] = useState(false)
  const [isCoreWebApisSupported, setIsCoreWebApisSupported] = useState(false)
  const [isOPFSupported, setIsOPFSupported] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    setIsBrowserSupported(checker.isBrowserSupported())
    setIsCoreWebApisSupported(checker.isCoreWebApisSupported())
    setIsMobile(checker.isMobile())
    setVersion(checker.getBrowserVersion())
    checker.isOPFSupported().then((res) => {
      setIsOPFSupported(res)
    })
  }, [isBrowserSupported, isCoreWebApisSupported])

  return {
    isBrowserSupported,
    isCoreWebApisSupported,
    isOPFSupported,
    version,
    isMobile,
  }
}
