"use client"

import "@/styles/globals.css"
import { Suspense, lazy, useEffect, useState } from "react"
import { Link, Outlet } from "react-router-dom"

import {
  EidosSharedEnvChannelName,
  MainServiceWorkerMsgType,
} from "@/lib/const"
import { isDevMode } from "@/lib/log"
import { useActivationCode } from "@/hooks/use-activation-code"
import { useShareMode } from "@/hooks/use-share-mode"
import { useWorker } from "@/hooks/use-worker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Toaster } from "@/components/ui/toaster"
import { CommandDialogDemo } from "@/components/cmdk"
import { Loading } from "@/components/loading"
import { ReloadPrompt } from "@/components/reload-prompt"
import { ShortCuts } from "@/components/shortcuts"
import { TailwindIndicator } from "@/components/tailwind-indicator"
import { ThemeProvider } from "@/components/theme-provider"

import { useSpaceAppStore } from "./[database]/store"
import { useConfigStore } from "./settings/store"

const AIChat = lazy(() => import("@/components/ai-chat/ai-chat-new"))

const useRootLayoutInit = () => {
  const { aiConfig } = useConfigStore()
  useEffect(() => {
    const mainServiceWorkerChannel = new BroadcastChannel(
      EidosSharedEnvChannelName
    )

    mainServiceWorkerChannel.postMessage({
      type: MainServiceWorkerMsgType.SetData,
      data: {
        apiKey: aiConfig.token,
        baseUrl: aiConfig.baseUrl,
      },
    })
    return () => {
      mainServiceWorkerChannel.close()
    }
  }, [aiConfig])
}

const Activation = () => {
  const { active } = useActivationCode()
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const handleActive = async () => {
    setLoading(true)
    await active(code)
    setLoading(false)
  }
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center">
      <div className="flex gap-2">
        <Input
          autoFocus
          className="w-[300px]"
          placeholder="Enter Code"
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
        Eidos is currently in development. Join{" "}
        <Link
          to="https://discord.gg/KAeDX8VEpK"
          target="_blank"
          className="text-blue-500"
        >
          Discord
        </Link>{" "}
        to gain early access.
      </div>
    </div>
  )
}

export default function RootLayout() {
  const { isAiOpen } = useSpaceAppStore()
  const { isInitialized, initWorker } = useWorker()
  const { isActivated } = useActivationCode()
  const { isShareMode } = useShareMode()
  useEffect(() => {
    // load worker when app start
    if (!isInitialized) {
      initWorker()
    }
  }, [initWorker, isInitialized])

  useRootLayoutInit()

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      {isActivated || isShareMode || isDevMode ? (
        <>
          {/* APP MODEL， a sidebar and main */}
          <div className="flex h-screen w-screen overflow-auto">
            <div className="h-full w-full grow">
              <Outlet />
            </div>
            {isAiOpen && (
              <Suspense fallback={<Loading />}>
                <AIChat />
              </Suspense>
            )}
          </div>
          <CommandDialogDemo />
          <ShortCuts />
        </>
      ) : (
        <Activation />
      )}
      <TailwindIndicator />
      <Toaster />
      <ReloadPrompt />
    </ThemeProvider>
  )
}
