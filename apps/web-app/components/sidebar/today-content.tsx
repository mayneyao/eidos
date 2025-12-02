"use client"

import { useEffect, useState } from "react"

import { Calendar } from "@/components/ui/calendar"
import { useRouterAdapter } from "@/hooks/use-router-adapter"

export const TodayContent = () => {
  const { navigate, params } = useRouterAdapter()
  const { day } = params
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    day ? new Date(day) : new Date()
  )

  useEffect(() => {
    if (day) {
      setSelectedDate(new Date(day))
    }
  }, [day])

  const handleDateSelect = (date: Date) => {
    const dateString = date.toLocaleDateString("en-CA").split("T")[0]
    navigate(`/journals/${dateString}`)
  }

  return (
    <div className="flex h-full w-full flex-col px-6">
      <div className="flex-1 overflow-auto">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (date) {
              handleDateSelect(date)
              setSelectedDate(date)
            }
          }}
          className="rounded-md  w-full"
        />
      </div>
    </div>
  )
}
