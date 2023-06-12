"use client"

import dynamic from "next/dynamic"


import { DatabaseLayoutBase } from "./base-layout"

// import { AIChat } from "./ai-chat";
const AIChat = dynamic(() => import("./ai-chat").then((mod) => mod.AIChat), {
  ssr: false,
})

export default function DatabaseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DatabaseLayoutBase>{children}</DatabaseLayoutBase>
}

