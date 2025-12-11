import { useState } from "react"

import { getLocalDate, getWeek, isWeekNodeId } from "@/lib/utils"
import { useRouterAdapter } from "@/hooks/use-router-adapter"
import { Editor } from "@/components/doc/editor"
import { BreadCrumb } from "@/components/nav/breadcrumb"
// import { CalendarIcon } from "@radix-ui/react-icons"

import { useTabTitle } from "@/apps/web-app/hooks/use-tab-title"
// import { Button } from "@/components/ui/button"
// import { Calendar } from "@/components/ui/calendar"
// import {
//   Popover,
//   PopoverContent,
//   PopoverTrigger,
// } from "@/components/ui/popover"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { WeekPage } from "../[week]/page"
import { useDays } from "../hooks"

// import Timeline from "../timeline"

export function EverydayPageContent({
  day,
  database,
}: {
  day: string | undefined
  database: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const isWeekPage = isWeekNodeId(day)
  const [month, setMonth] = useState<Date>(new Date(day as string))
  const { navigate } = useRouterAdapter()
  const { days } = useDays()
  const { isCmdkOpen } = useAppRuntimeStore()
  const weekNumber = day ? getWeek(day) : null
  const formattedWeek = weekNumber
    ? weekNumber.toString().padStart(2, "0")
    : null
  const weekNodeId =
    day && formattedWeek ? `${day.slice(0, 4)}-w${formattedWeek}` : null
  useTabTitle(day)
  const handleDayClick = (date: Date, closePopover = false) => {
    const day = getLocalDate(date)
    setMonth(date)
    navigate(`/journals/${day}`)
    closePopover && setOpen(false)
  }
  if (isWeekPage) {
    return <WeekPage />
  }

  return (
    <div className="flex gap-4 grow flex-col">
      <Editor
        isEditable={!isCmdkOpen}
        title={day}
        showTitle
        namespace="eidos-notes"
        docId={day}
        renderTitle={() => {
          if (!day) return null
          return (
            <div
              className="h-[50px] text-4xl font-mono font-bold text-primary outline-none my-2 flex w-full items-baseline gap-2"
              id="doc-title"
            >
              <span className="text-4xl font-bold leading-[1.1]">{day}</span>
              {weekNodeId && formattedWeek ? (
                <button
                  className="px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-primary"
                  type="button"
                  onClick={() => navigate(`/journals/${weekNodeId}`)}
                >
                  [week{formattedWeek}]
                </button>
              ) : null}
            </div>
          )
        }}
      />
      {/* <Timeline
        recordDates={days}
        currentDay={new Date(day as string)}
        onTimeSelect={(date) => {
          handleDayClick(date)
        }}
      /> */}
    </div>
  )
}

export default function EverydayPage() {
  const { params } = useRouterAdapter()
  const { day, database } = params
  return <EverydayPageContent day={day} database={database} />
}
