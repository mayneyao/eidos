"use client"

import { useEffect } from "react"

import { getWorker } from "@/lib/sqlite/sql-worker"

export default function DatabaseHome() {
  useEffect(() => {
    // just pre-load the worker to make it faster
    getWorker()
  }, [])
  return (
    <div className="item-center flex justify-center p-8">
      select a table to view
    </div>
  )
}
