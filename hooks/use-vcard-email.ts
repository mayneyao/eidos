import { useCallback, useMemo } from "react"

import { DOMAINS } from "@/lib/const"
import { useAPIConfigStore } from "@/apps/web-app/settings/api/store"

export const useVCardEmail = () => {
  const { apiAgentConfig } = useAPIConfigStore()

  const getEmail = useCallback(
    (tableId: string, space: string) => {
      const uuid = new URL(apiAgentConfig.url).pathname.split("/").pop()
      return `${uuid}.${space}.${tableId.slice(-8)}@eidos.ink`
    },
    [apiAgentConfig.url]
  )

  const enabled = useMemo(() => {
    try {
      return (
        apiAgentConfig.enabled &&
        new URL(apiAgentConfig.url).host ==
          new URL(DOMAINS.API_AGENT_SERVER).host
      )
    } catch (error) {
      return false
    }
  }, [apiAgentConfig])

  return { getEmail, enabled }
}
