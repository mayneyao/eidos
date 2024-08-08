import { Suspense, lazy } from "react"
import { Outlet } from "react-router-dom"

import { DocExtBlockLoader } from "@/components/doc-ext-block-loader"
import { KeyboardShortCuts } from "@/components/keyboard-shortcuts"
import { useLayoutInit } from "@/app/[database]/hook"

import { DatabaseLayoutBase } from "./base-layout"

const WebLLM = lazy(() => import("@/components/ai-chat/webllm"))

export default function DatabaseLayout() {
  useLayoutInit()
  return (
    <DatabaseLayoutBase>
      <DocExtBlockLoader />
      <KeyboardShortCuts />
      <Suspense fallback={<div></div>}>
        <WebLLM />
      </Suspense>
      <Outlet />
    </DatabaseLayoutBase>
  )
}
