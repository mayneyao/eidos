"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { opfsDocManager } from "@/lib/fs"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Editor } from "@/components/doc/editor"

const getToday = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = (today.getMonth() + 1).toString().padStart(2, "0")
  const day = today.getDate().toString().padStart(2, "0")
  const date = `${year}-${month}-${day}`
  return date
}

export default function EverydayPage() {
  const params = useCurrentPathInfo()
  const [days, setDays] = useState<string[]>([])
  const [daysContent, setDaysContent] = useState<string[]>([])
  const [currentDay, setCurrentDay] = useState<string>("")
  useEffect(() => {
    const today = getToday()
    opfsDocManager
      .listDir(["spaces", params.database, "everyday"])
      .then(async (days: FileSystemFileHandle[]) => {
        const existDays = days.map((d) => d.name.split(".")[0])
        const todayIndex = existDays.indexOf(today)
        let _days: string[]
        if (todayIndex > -1) {
          const beforeToday = existDays.slice(todayIndex + 1)
          _days = [today, ...beforeToday]
        } else {
          _days = [today, ...existDays]
        }
        console.log(_days, existDays)
        setDays(_days)
        const res = await Promise.all(
          _days.map(async (day) => {
            return opfsDocManager.getDocContent([
              "spaces",
              params.database,
              "everyday",
              day + ".md",
            ])
          })
        )
        setDaysContent(res)
      })
  }, [params.database])

  const handleDocSave = (day: string) => {
    return (content: string) =>
      opfsDocManager.updateDocFile(
        ["spaces", params.database, "everyday", `${day}.md`],
        content
      )
  }
  const handleClick = (day: string) => {
    setCurrentDay(day)
  }

  return (
    <div className="prose mx-auto flex flex-col gap-2 p-10 dark:prose-invert lg:prose-xl xl:prose-2xl">
      {days.map((day, index) => {
        const content = daysContent[index]
        return (
          <div
            key={day}
            className="border-b border-slate-300"
            onClick={() => handleClick(day)}
          >
            <Link href={`/${params.database}/everyday/${day}`}>{day}</Link>
            <Editor
              autoFocus={index === 0}
              isEditable
              placeholder=""
              autoSave={currentDay === day}
              onSave={handleDocSave(day)}
              initContent={content}
            />
          </div>
        )
      })}
    </div>
  )
}
