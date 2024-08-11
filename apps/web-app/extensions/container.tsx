import { useEffect, useRef, useState } from "react"
import { EventEmitter } from "ahooks/lib/useEventEmitter"

import { ExtensionSourceType, useExtMsg } from "./hooks/use-ext-msg"

export function ExtensionContainer({
  ext,
  reload$,
}: {
  ext: string
  reload$?: EventEmitter<void>
}) {
  const containerRef = useRef<HTMLIFrameElement>(null)
  const { handleMsg } = useExtMsg(ExtensionSourceType.App)

  useEffect(() => {
    window.addEventListener("message", handleMsg)
    return () => {
      window.removeEventListener("message", handleMsg)
    }
  }, [handleMsg])

  const reloadIframe = () => {
    if (containerRef.current) {
      containerRef.current.src = ""
      containerRef.current.src = `https://${ext}.ext.eidos.space`
    }
  }

  reload$?.useSubscription(reloadIframe)

  if (!ext?.length) {
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
