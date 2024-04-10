import { useEffect, useRef } from "react"

import { useExtMsg } from "./hooks/use-ext-msg"

export function ExtensionContainer({ ext }: { ext: string }) {
  const containerRef = useRef<HTMLIFrameElement>(null)
  const { handleMsg } = useExtMsg()

  useEffect(() => {
    window.addEventListener("message", handleMsg)
    return () => {
      window.removeEventListener("message", handleMsg)
    }
  }, [handleMsg])

  if (!ext.length) {
    return null
  }
  return (
    <iframe
      ref={containerRef}
      src={`https://${ext}.ext.eidos.space`}
      frameBorder="0"
      className="flex h-full w-full"
    ></iframe>
  )
}
