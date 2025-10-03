import { useEffect, useState } from "react"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"

import { getToday, getTomorrow, getYesterday } from "@/lib/utils"
import { useDocPropertyTypes } from "@/apps/web-app/components/doc-property-global/property-type-hook"
import { useQueryNode } from "@/apps/web-app/hooks/use-query-node"

import { mentionsCache } from "./helper"

export function useMentionLookupService(
  mentionString: string | null,
  enabledCreate: boolean,
  currentDocId?: string
) {
  const [results, setResults] = useState<Array<ITreeNode>>([])

  const { queryNodes } = useQueryNode()
  const { customPropertyTypes } = useDocPropertyTypes()

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

        // Add special days
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

        // Add document properties
        const matchingProperties = customPropertyTypes.filter((prop) =>
          prop.name.toLowerCase().includes(mentionString.toLowerCase().trim())
        )
        matchingProperties.forEach((prop) => {
          _newResults.unshift({
            id: `this#${prop.name}`,
            name: prop.name,
            type: "property",
            mode: "property",
            propertyType: prop.type,
          })
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
  }, [
    currentDocId,
    enabledCreate,
    mentionString,
    queryNodes,
    customPropertyTypes,
  ])

  return results
}
