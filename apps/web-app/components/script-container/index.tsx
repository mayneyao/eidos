import { useEffect, useRef } from "react"

import { ExtensionSourceType, useExtMsg } from "@/hooks/use-ext-msg"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

// ScriptContainer used to run script in iframe
export const ScriptContainer = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { scriptContainerRef, setScriptContainerRef } = useAppRuntimeStore()

  const { handleMsg } = useExtMsg(ExtensionSourceType.Script)
  useEffect(() => {
    window.addEventListener("message", handleMsg)
    return () => {
      window.removeEventListener("message", handleMsg)
    }
  }, [handleMsg])
  const { space } = useCurrentPathInfo()

  useEffect(() => {
    if (iframeRef.current) {
      setScriptContainerRef(iframeRef)
    }
  }, [setScriptContainerRef])

  return (
    <iframe
      ref={iframeRef}
      src={`http://sandbox.${space}.eidos.localhost:13127/`}
      sandbox="allow-scripts allow-popups"
      allow="autoplay"
      width="0"
      height="0"
    >
      {" "}
      Your browser does not support iframes.{" "}
    </iframe>
  )
}
