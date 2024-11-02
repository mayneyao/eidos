import { useEffect, useRef } from "react"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import {
  ExtensionSourceType,
  useExtMsg,
} from "@/apps/web-app/extensions/hooks/use-ext-msg"

import sdkInjectScript from "./sdk-inject-script.html?raw"

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

  const sdkInjectScriptContent = sdkInjectScript.replace(
    "${{currentSpace}}",
    space
  )

  useEffect(() => {
    if (iframeRef.current) {
      setScriptContainerRef(iframeRef)
    }
  }, [setScriptContainerRef])

  return (
    <iframe
      ref={iframeRef}
      srcDoc={`
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Eidos Script Container</title>
    ${sdkInjectScriptContent}
  </head>
  <body>
    <p id="message">Loading...</p>
  </body>
</html>

`}
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
