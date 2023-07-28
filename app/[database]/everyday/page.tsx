"use client"

import { useState } from "react"
import useInfiniteScroll from "react-infinite-scroll-hook"
import { Link } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqlite } from "@/hooks/use-sqlite"
import { Editor } from "@/components/doc/editor"
import { Loading } from "@/components/loading"

import { useAllDays } from "./hooks"

export default function EverydayPage() {
  const params = useCurrentPathInfo()
  const { loading, days, hasNextPage, error, loadMore } = useAllDays(
    params.space
  )
  const { sqlite } = useSqlite(params.space)
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

  const handleDocSave = (day: string) => {
    return (content: string) => {
      sqlite?.updateDoc(day, content, true)
    }
  }
  const handleClick = (day: string) => {
    setCurrentDay(day)
  }

  return (
    <div className="prose mx-auto flex flex-col gap-2 p-10 dark:prose-invert lg:prose-xl xl:prose-2xl xs:p-5">
      {days.map((day, index) => {
        const content = day.content
        return (
          <div
            key={day.id}
            className="border-b border-slate-300"
            onClick={() => handleClick(day.id)}
          >
            <Link to={`/${params.database}/everyday/${day.id}`}>{day.id}</Link>
            <Editor
              docId={day.id}
              autoFocus={index === 0}
              isEditable={currentDay === day.id}
              placeholder=""
              onSave={handleDocSave(day.id)}
              initContent={content}
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
  )
}
