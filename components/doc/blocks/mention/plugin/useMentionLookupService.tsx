import { useEffect, useState } from "react"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { getToday, getTomorrow, getYesterday } from "@/lib/utils"
import { useQueryNode } from "@/hooks/use-query-node"

import { mentionsCache } from "./helper"

export function useMentionLookupService(
  mentionString: string | null,
  enabledCreate: boolean,
  currentDocId?: string
) {
  const [results, setResults] = useState<Array<ITreeNode>>([])

  const { queryNodes } = useQueryNode()

  useEffect(() => {
    const cachedResults = mentionsCache.get(mentionString)
    if (cachedResults === null) {
      return
    } else if (cachedResults !== undefined) {
      setResults(cachedResults)
      return
    }
    mentionString &&
      queryNodes(mentionString ?? "").then((newResults) => {
        let _newResults = [...(newResults || [])] as any[]
        const specialDays = [
          {
            title: "Today",
            get: getToday,
          },
          {
            title: "Tomorrow",
            get: getTomorrow,
          },
          {
            title: "Yesterday",
            get: getYesterday,
          },
        ]
        specialDays.forEach((day) => {
          if (
            day.title.toLowerCase().includes(mentionString.toLowerCase().trim())
          ) {
            _newResults.unshift({
              id: day.get(),
              name: day.title,
              type: "day",
              mode: "node",
            })
          }
        })
        _newResults = _newResults.filter((result) => {
          return result.id !== currentDocId
        })
        if (enabledCreate) {
          _newResults.push({
            id: `new-${mentionString}`,
            name: `New "${mentionString}" sub-doc`,
            type: "doc",
            mode: "node",
          })
        }
        mentionsCache.set(mentionString, _newResults)
        setResults(_newResults ?? [])
      })
  }, [currentDocId, enabledCreate, mentionString, queryNodes])

  return results
}
