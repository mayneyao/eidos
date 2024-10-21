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
      <div className="text-green-500 font-semibold">
        Your browser is supported
      </div>
    )
  }

  return (
    <div className="text-red-500 text-sm">
      {!isBrowserSupported && (
        <p>
          Please use a Chromium-based browser (Chrome, Edge, Arc, Brave, etc.).
          Eidos is not tested on other browsers.
        </p>
      )}
      {!isCoreWebApisSupported && (
        <p>
          Please update your browser to the latest version.
          {isBrowserSupported &&
            (isMobile ? (
              <span>
                {" "}
                Mobile browsers have limitations. Use a desktop browser for the
                best experience.
              </span>
            ) : (
              <span> Your version: {version}. Recommended: 122+</span>
            ))}
        </p>
      )}
    </div>
  )
}

export const Activation = () => {
  const { active, isActivated } = useActivation()
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()

  const handleActive = async () => {
    try {
      setLoading(true)
      await active(code)
    } catch (error) {
      // Handle error
    } finally {
      setLoading(false)
    }
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
    <div className="flex flex-col items-center justify-center gap-6 max-w-md mx-auto p-4">
      <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">
        Activation
      </h2>

      {!isDesktopMode && <BrowserChecker />}

      <div className="w-full">
        <Input
          className="w-full mb-2"
          placeholder="Enter Activation Key"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleActive()}
        />
        <Button className="w-full" onClick={handleActive} disabled={loading}>
          {loading ? "Activating..." : "Activate"}
        </Button>
      </div>

      <p className="text-sm text-center">
        Don't have a key?{" "}
        <Link
          to="https://store.eidos.space/buy/2397216c-4322-40fa-b425-681d455e6702"
          target="_blank"
          className="text-blue-500 hover:underline"
        >
          Get a free early access key
        </Link>
      </p>

      <p className="text-xs text-center text-gray-500">
        Eidos is in development. Join our{" "}
        <Link
          to={DOMAINS.DISCORD_INVITE}
          target="_blank"
          className="text-blue-500 hover:underline"
        >
          Discord
        </Link>{" "}
        for updates.
      </p>
    </div>
  )
}
