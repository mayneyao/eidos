"use client"

import { useState } from "react"
import Link from "next/link"
import useInfiniteScroll from "react-infinite-scroll-hook"

import { opfsDocManager } from "@/lib/opfs"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Editor } from "@/components/doc/editor"
import { Loading } from "@/components/loading"

import { useAllDays } from "./hooks"

export default function EverydayPage() {
  const params = useCurrentPathInfo()
  const { loading, days, items, hasNextPage, error, loadMore } = useAllDays(
    params.database
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
    rootMargin: "0px 0px 400px 0px",
  })

  const [currentDay, setCurrentDay] = useState<string>("")

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
      {items.map((content, index) => {
        const day = days[index]
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
      {(loading || hasNextPage) && (
        <div ref={sentryRef} className="mx-auto">
          <Loading />
        </div>
      )}
    </div>
  )
}
