import { useMemo, useState } from "react"
import useInfiniteScroll from "react-infinite-scroll-hook"
import { Link, useParams, useSearchParams } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Editor } from "@/components/doc/editor"
import { Loading } from "@/components/loading"

import { DayHeatMap } from "./heatmap"
import { useAllDays, useDays } from "./hooks"

export default function EverydayPage() {
  const params = useCurrentPathInfo()
  const { loading, days, hasNextPage, error, loadMore } = useAllDays(
    params.space
  )
  let [searchParams, setSearchParams] = useSearchParams()

  const [sentryRef] = useInfiniteScroll({
    loading,
    hasNextPage,
    onLoadMore: loadMore,
    // When there is an error, we stop infinite loading.
    // It can be reactivated by setting "error" state as undefined.
    disabled: !!error,
    // `rootMargin` is passed to `IntersectionObserver`.
    // We can use it to trigger 'onLoadMore' when the sentry comes near to become
    // visible, instead of becoming fully visible on the screen.
    // rootMargin: "0px 0px 200px 0px",
  })

  const [currentDay, setCurrentDay] = useState<string>("")

  const handleClick = (day: string) => {
    setCurrentDay(day)
  }
  const [year, setYear] = useState<number>(
    searchParams.get("year")
      ? parseInt(searchParams.get("year")!)
      : new Date().getFullYear()
  )
  const { days: _days, years } = useDays()
  const startDate = useMemo(() => {
    return new Date(year, 0, 1)
  }, [year])

  return (
    <ScrollArea className="mx-auto flex w-full">
      <div className="prose mx-auto flex w-full flex-col gap-2 p-10 dark:prose-invert  xs:p-5">
        <div className="hidden md:block">
          <div className="flex cursor-pointer select-none gap-2">
            {years.map((_year) => {
              const isActive = _year === year
              return (
                <div
                  key={_year}
                  onClick={() => setYear(_year)}
                  className={`rounded-sm p-2 text-sm ${
                    isActive ? "bg-secondary" : ""
                  }`}
                >
                  {_year}
                </div>
              )
            })}
          </div>
          <DayHeatMap days={_days} startDate={startDate} />
        </div>
        <div className="flex flex-col gap-2">
          {days.map((day, index) => {
            return (
              <div
                key={day.id}
                className="border-b border-slate-300"
                onClick={() => handleClick(day.id)}
              >
                <Link
                  className="text-2xl"
                  to={`/${params.database}/everyday/${day.id}`}
                >
                  {day.id}
                </Link>
                <Editor
                  docId={day.id}
                  namespace="eidos-notes-home-page"
                  autoFocus={index === 0}
                  isEditable
                  placeholder=""
                  disableSelectionPlugin
                  disableSafeBottomPaddingPlugin
                  disableUpdateTitle
                  isActive={currentDay === day.id}
                  disableManuallySave={currentDay !== day.id}
                  className="my-2 ml-0 !pl-0"
                />
              </div>
            )
          })}
          {(loading || hasNextPage) && (
            <div ref={sentryRef} className="mx-auto">
              <Loading />
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  )
}
