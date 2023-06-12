"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { usePeerConnect } from "@/hooks/use-peer"
import DatabaseLayout from "@/app/[database]/layout"

interface RootLayoutProps {
  children: React.ReactNode
}

export default function ShareDatabaseLayout({ children }: RootLayoutProps) {
  const searchParams = useSearchParams()
  const sharePeerId = searchParams.get("peerId")
  const conn = usePeerConnect(sharePeerId)
  const { setShareMode } = useAppRuntimeStore()
  useEffect(() => {
    setShareMode(true)
  }, [])
  return (
    // border to show difference between share and app
    <DatabaseLayout
      className={cn(
        "border-box border-2",
        conn ? "border-green-400" : "border-red-400"
      )}
    >
      {children}
    </DatabaseLayout>
  )
}
