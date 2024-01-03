import { useMemo } from "react"
import HeatMap from "@uiw/react-heat-map"
import { useNavigate, useParams } from "react-router-dom"

export const DayHeatMap = (props: { days: Date[]; startDate: Date }) => {
  const value = useMemo(() => {
    return props.days.map((day) => ({
      date: day.toLocaleDateString(),
      count: 4,
    }))
  }, [props.days])
  const { database } = useParams()
  const router = useNavigate()
  const handleDayClick = (date: string) => {
    const [year,mouth,day] = date.split('/')
    // yyyy-mm-dd
    const formatDay = `${year}-${mouth.padStart(2,'0')}-${day.padStart(2,'0')}`
    router(`/${database}/everyday/${formatDay}`)
  }
  return (
    <div className="w-full">
      <HeatMap
        value={value}
        width="100%"
        weekLabels={["", "Mon", "", "Wed", "", "Fri", ""]}
        startDate={props.startDate || new Date()}
        legendCellSize={0}
        rectRender={(props, data) => {
          return (
            <rect
              {...props}
              onClick={() => {
                const date = data.date
                handleDayClick(date)
              }}
            />
          )
        }}
      />
    </div>
  )
}
