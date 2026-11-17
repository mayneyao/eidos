import { createContext, useContext, type Context } from "react"
import type { EidosFileUIHost } from "./context"
import { translateEidosFileUI } from "./i18n"

const defaultHost: EidosFileUIHost = {
  themeName: "light",
  locale: "en",
  weekStartsOnMonday: true,
  translate: (message, values) => translateEidosFileUI("en", message, values),
}

// Provider components and hooks can refresh in different module generations.
// Keep their shared Context identity and negotiated host capabilities intact.
const hot = (
  import.meta as ImportMeta & {
    hot?: { data?: { eidosFileUIContext?: Context<EidosFileUIHost> } }
  }
).hot

const hotData = hot?.data
export const EidosFileUIContext: Context<EidosFileUIHost> =
  hotData?.eidosFileUIContext ?? createContext<EidosFileUIHost>(defaultHost)

if (hotData) hotData.eidosFileUIContext = EidosFileUIContext

export function useEidosFileUI(): EidosFileUIHost {
  return useContext(EidosFileUIContext)
}
