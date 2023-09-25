import { useEffect, useRef } from "react"
import { useParams, useSearchParams } from "react-router-dom"

import { useExtMsg } from "./hooks/use-ext-msg"

export function ExtensionContainer() {
  const containerRef = useRef<HTMLIFrameElement>(null)
  const { handleMsg } = useExtMsg()
  const { ext } = useParams()
  // searchParams
  const [searchParams] = useSearchParams()
  const isDev = searchParams.get("isDev")
  const port = searchParams.get("port")
  const devUrl = `http://localhost:${port}`

  useEffect(() => {
    window.addEventListener("message", handleMsg)
    return () => {
      window.removeEventListener("message", handleMsg)
    }
  }, [handleMsg])

  return (
    <iframe
      ref={containerRef}
      src={isDev ? devUrl : `https://${ext}.ext.eidos.space`}
      frameBorder="0"
      className="flex h-full  w-full"
    ></iframe>
  )
}
