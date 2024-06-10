import { useState } from "react"
import { Link, useParams } from "react-router-dom"

import {
  getDaysByYearWeek,
  getToday,
  getTomorrow,
  getYesterday,
} from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Editor } from "@/components/doc/editor"

export const WeekPage = () => {
  const params = useCurrentPathInfo()
  const { day } = useParams()
  const today = getToday()
  const tomorrow = getTomorrow()
  const yesterday = getYesterday()
  const [currentDay, setCurrentDay] = useState<string>("")
  const days: any[] = getDaysByYearWeek(day!).map((day) => {
    return {
      id: day,
    }
  })
  return (
    <div className="container prose mx-auto mt-2 flex flex-col gap-2 dark:prose-invert">
      {days.map((day, index) => {
        const showTitle = (() => {
          if (day.id == today) return "Today"
          if (day.id == tomorrow) return "Tomorrow"
          if (day.id == yesterday) return "Yesterday"
          return day.id
        })()
        return (
          <div
            key={day.id}
            className="border-slate-300"
            onClick={() => setCurrentDay(day.id)}
          >
            <Link
              className="text-2xl opacity-70 hover:opacity-90"
              to={`/${params.database}/everyday/${day.id}`}
            >
              {showTitle}
            </Link>
            <Editor
              docId={day.id}
              namespace="eidos-notes-home-page"
              autoFocus={index === 0}
              isEditable
              placeholder=""
              isActive={currentDay === day.id}
              disableSelectionPlugin
              disableSafeBottomPaddingPlugin
              disableUpdateTitle
              disableManuallySave={currentDay !== day.id}
              className="my-2 ml-0 !pl-0"
            />
          </div>
        )
      })}
    </div>
  )
}
