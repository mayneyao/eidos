import { useEffect, useState } from "react"
import type { SpacePathSearchHit } from "../shared/contracts"
import type {
  TextSearchOptions,
  TextSearchProgress,
} from "../shared/text-search"

export type QuickOpenMode = "name" | "text"

interface SearchState {
  key: string
  paths: SpacePathSearchHit[]
  progress: TextSearchProgress | null
  error: string | null
  loading: boolean
}

export function useQuickOpenSearch(
  query: string,
  mode: QuickOpenMode,
  options: TextSearchOptions,
  composing: boolean,
  generation: number
) {
  const key = JSON.stringify([query, mode, options, composing, generation])
  const [state, setState] = useState<SearchState | null>(null)
  useEffect(() => {
    if (!query || composing) return
    let active = true
    let started = false
    const requestId = crypto.randomUUID()
    const initial: SearchState = {
      key,
      paths: [],
      progress: null,
      error: null,
      loading: true,
    }
    setState(initial)
    const accept = (progress: TextSearchProgress) => {
      if (!active || progress.requestId !== requestId) return
      setState({ ...initial, progress, loading: !progress.done })
    }
    const unsubscribe =
      mode === "text"
        ? window.eidosLite.onTextSearchProgress(accept)
        : () => undefined
    const timer = window.setTimeout(
      () => {
        started = true
        const search =
          mode === "name"
            ? window.eidosLite
                .searchSpacePaths(query, 50, true)
                .then((paths) => {
                  if (active) setState({ ...initial, paths, loading: false })
                })
            : window.eidosLite
                .searchSpaceText(requestId, query, options)
                .then(accept)
        void search.catch((cause: unknown) => {
          if (active)
            setState({
              ...initial,
              loading: false,
              error: cause instanceof Error ? cause.message : String(cause),
            })
        })
      },
      mode === "name" ? 80 : 200
    )
    return () => {
      active = false
      window.clearTimeout(timer)
      unsubscribe()
      if (mode === "text" && started)
        void window.eidosLite.cancelTextSearch(requestId).catch(() => undefined)
    }
  }, [key])
  // Results from a superseded query must never remain keyboard-activatable,
  // including the render before the previous effect's cleanup runs.
  const current = state?.key === key && !composing ? state : null
  const loading = !!query && !composing && (current?.loading ?? true)
  const [showProgress, setShowProgress] = useState(false)
  useEffect(() => {
    setShowProgress(false)
    if (!loading) return
    const timer = window.setTimeout(() => setShowProgress(true), 200)
    return () => window.clearTimeout(timer)
  }, [loading, key])
  return {
    paths: current?.paths ?? [],
    progress: current?.progress ?? null,
    error: current?.error ?? null,
    loading,
    showProgress,
  }
}
