"use client"


import { DatabaseLayoutBase } from "./base-layout"

export default function DatabaseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DatabaseLayoutBase>{children}</DatabaseLayoutBase>
}
