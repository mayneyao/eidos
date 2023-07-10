"use client"


import { Outlet } from "react-router-dom"
import { DatabaseLayoutBase } from "./base-layout"

export default function DatabaseLayout() {
  return <DatabaseLayoutBase>
    <Outlet/>
  </DatabaseLayoutBase>
}
