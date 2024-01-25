import { useEffect, useRef } from "react"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useExtMsg } from "@/app/extensions/hooks/use-ext-msg"

import iframeHTML from "./iframe.html?raw"

// ScriptContainer used to run script in iframe
export const ScriptContainer = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { scriptContainerRef, setScriptContainerRef } = useAppRuntimeStore()

  const { handleMsg } = useExtMsg()
  useEffect(() => {
    window.addEventListener("message", handleMsg)
    return () => {
      window.removeEventListener("message", handleMsg)
    }
  }, [handleMsg])
  const { space } = useCurrentPathInfo()

  const iframeContent = iframeHTML.replace("${{currentSpace}}", space)

  useEffect(() => {
    if (iframeRef.current) {
      setScriptContainerRef(iframeRef)
    }
  }, [setScriptContainerRef])

  return (
    <iframe
      ref={iframeRef}
      srcDoc={iframeContent}
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
