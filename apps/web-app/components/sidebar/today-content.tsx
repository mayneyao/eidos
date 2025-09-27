"use client"

import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Calendar } from "@/components/ui/calendar"

export const TodayContent = () => {
  const router = useNavigate()
  const { space } = useCurrentPathInfo()
  const { day } = useParams()
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
    router(`/${space}/everyday/${dateString}`)
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
