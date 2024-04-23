import "@/styles/globals.css"
import { useEffect } from "react"
import { Outlet } from "react-router-dom"

import {
  EidosSharedEnvChannelName,
  MainServiceWorkerMsgType,
} from "@/lib/const"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useActivationCode } from "@/hooks/use-activation-code"
import { useWorker } from "@/hooks/use-worker"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Progress } from "@/components/ui/progress"
import { Toaster } from "@/components/ui/toaster"
import { CommandDialogDemo } from "@/components/cmdk"
import { ReloadPrompt } from "@/components/reload-prompt"
import { ShortCuts } from "@/components/shortcuts"
import { TailwindIndicator } from "@/components/tailwind-indicator"
import { ThemeProvider } from "@/components/theme-provider"

import { useConfigStore } from "./settings/store"

const BlockUIDialog = () => {
  const { blockUIMsg, blockUIData } = useAppRuntimeStore()
  const open = blockUIMsg !== null

  return (
    <AlertDialog open={open}>
      <AlertDialogTrigger className="fixed bottom-1"></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <div className="text-lg font-bold">Processing</div>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Progress value={blockUIData?.progress || 0} max={100} />
            This may take a while, please wait...
            <br />
            {blockUIMsg}
          </AlertDialogDescription>
        </AlertDialogHeader>
      </AlertDialogContent>
    </AlertDialog>
  )
}

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

export default function RootLayout() {
  const { isInitialized, initWorker } = useWorker()
  const { isActivated } = useActivationCode()

  useEffect(() => {
    // load worker when app start
    if (isActivated && !isInitialized) {
      initWorker()
    }
  }, [initWorker, isInitialized, isActivated])

  useRootLayoutInit()

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <>
        {/* APP MODEL， a sidebar and main */}
        <div className="flex h-screen w-screen overflow-auto">
          <div className="h-full w-auto grow">
            <Outlet />
          </div>
        </div>
        <CommandDialogDemo />
        <ShortCuts />
      </>
      <TailwindIndicator />
      <Toaster />
      <BlockUIDialog />
      <ReloadPrompt />
    </ThemeProvider>
  )
}
