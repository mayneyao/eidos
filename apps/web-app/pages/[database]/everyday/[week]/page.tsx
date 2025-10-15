import { useState } from "react"
import { Link, useParams } from "react-router-dom"

import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { Editor } from "@/components/doc/editor"
import { getDaysByYearWeek } from "@/lib/utils"

import { getDisplayTitle } from "../utils"

export const WeekPage = () => {
  const { day } = useParams()
  const [currentDay, setCurrentDay] = useState<string>("")
  const { isCmdkOpen } = useAppRuntimeStore()
  const days: any[] = getDaysByYearWeek(day!).map((day) => {
    return {
      id: day,
    }
  })
  return (
    <div className="container prose mx-auto mt-2 flex flex-col gap-2 dark:prose-invert">
      {days.map((day, index) => {
        return (
          <div
            key={day.id}
            className="border-slate-300"
            onClick={() => setCurrentDay(day.id)}
          >
            <Link
              className="text-2xl opacity-70 hover:opacity-90"
              to={`/everyday/${day.id}`}
            >
              {getDisplayTitle(day.id)}
            </Link>
            <Editor
              docId={day.id}
              namespace="eidos-notes-home-page"
              autoFocus={index === 0}
              isEditable={!isCmdkOpen}
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
