import type { EidosLiteApi } from "../shared/contracts"

declare global {
  interface Window {
    eidosLite: EidosLiteApi
  }
}

export {}
