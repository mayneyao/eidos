import { useEffect, useState } from "react"
import type { PluginInstallTask } from "../shared/plugins"

export function usePluginInstallTasks() {
  const [tasks, setTasks] = useState<Record<string, PluginInstallTask>>({})
  useEffect(() => {
    let active = true
    let received = false
    const stop = window.eidosLite.onPluginInstallTasks?.((next) => {
      received = true
      if (active) setTasks(next)
    })
    void window.eidosLite
      .getPluginInstallTasks?.()
      .then((next) => {
        if (active && !received) setTasks(next)
      })
      .catch(() => {})
    return () => {
      active = false
      stop?.()
    }
  }, [])
  return tasks
}
