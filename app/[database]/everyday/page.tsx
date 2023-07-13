"use client"

import { useState } from "react"
import useInfiniteScroll from "react-infinite-scroll-hook"
import { Link } from "react-router-dom"

import { opfsDocManager } from "@/lib/opfs"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Editor } from "@/components/doc/editor"
import { Loading } from "@/components/loading"

import { useAllDays } from "./hooks"

export default function EverydayPage() {
  const params = useCurrentPathInfo()
  const { loading, days, items, hasNextPage, error, loadMore } = useAllDays(
    params.space
  )
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
      opfsDocManager.updateDocFile(
        ["spaces", params.space, "everyday", `${day}.md`],
        content
      )
    }
  }
  const handleClick = (day: string) => {
    setCurrentDay(day)
  }

  return (
    <div className="prose mx-auto flex flex-col gap-2 p-10 dark:prose-invert lg:prose-xl xl:prose-2xl">
      {days.slice(0, items.length).map((day, index) => {
        const content = items[index]
        return (
          <div
            key={day}
            className="border-b border-slate-300"
            onClick={() => handleClick(day)}
          >
            <Link to={`/${params.database}/everyday/${day}`}>{day}</Link>
            <Editor
              docId={day}
              autoFocus={index === 0}
              isEditable={currentDay === day}
              placeholder=""
              onSave={handleDocSave(day)}
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
