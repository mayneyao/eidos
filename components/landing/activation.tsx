import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { DOMAINS } from "@/lib/const"
import { isDesktopMode } from "@/lib/env"
import { useActivation } from "@/hooks/use-activation"
import { useBrowserCheck } from "@/hooks/use-browser-check"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const BrowserChecker = () => {
  const {
    isBrowserSupported,
    isCoreWebApisSupported,
    isOPFSupported,
    isMobile,
    version,
  } = useBrowserCheck()
  if (isBrowserSupported && isCoreWebApisSupported && isOPFSupported) {
    return (
      <div>
        <h1 className="text-green-500">Your browser is supported</h1>
      </div>
    )
  }
  return (
    <>
      {!isBrowserSupported && (
        <div className="text-red-500">
          It seems like you are not using a Chromium-based browser.
          <br />
          Eidos is not tested on other browsers yet.
          <br />
          Recommended browsers are Chrome, Edge, Arc, Brave, etc.
        </div>
      )}
      {!isCoreWebApisSupported && (
        <div className="text-red-500">
          Eidos requires some new Web APIs to work properly. Please update your
          browser to the latest. <br />
          {isBrowserSupported &&
            (isMobile ? (
              <div>
                It seems like you are using a mobile browser. It works, but with
                some limitations. Use a desktop browser for the best experience.
              </div>
            ) : (
              <div>
                Your browser version: {version} <br />
                Recommended version: 122+
              </div>
            ))}
        </div>
      )}
    </>
  )
}

export const Activation = () => {
  const { active, isActivated } = useActivation()
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()
  const handleActive = async () => {
    setLoading(true)
    await active(code)
    setLoading(false)
  }

  if (isActivated) {
    return (
      <div
        id="active-selection"
        className="flex w-full flex-col items-center justify-center gap-4"
      >
        <h2 className="text-center text-3xl font-bold tracking-tighter sm:text-5xl">
          Activation
        </h2>
        <div>
          🎉You have already activated Eidos.
          <Button size="xs" variant="ghost" onClick={() => nav("/")}>
            Open App
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex w-full flex-col items-center justify-center gap-4"
      id="active-selection"
    >
      <h2 className="text-center text-3xl font-bold tracking-tighter sm:text-5xl">
        Activation
      </h2>
      {!isDesktopMode && <BrowserChecker />}
      <div className="flex gap-2">
        <Input
          // autoFocus
          className="w-[300px] ring"
          placeholder="Enter Key"
          value={code}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleActive()
            }
          }}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button onClick={handleActive} disabled={loading}>
          Enter
        </Button>
      </div>

      <div className="mt-2 p-2 text-sm">
        Eidos is currently in development; join our{" "}
        <Link
          to={DOMAINS.DISCORD_INVITE}
          target="_blank"
          className="text-blue-500"
        >
          Discord
        </Link>{" "}
        server to stay updated on the latest progress
      </div>
    </div>
  )
}
