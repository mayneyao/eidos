interface Env {
  RUNTIME_TICKET_SECRET: string
  PUBLISH_VIEWER_EXCHANGE_SECRET: string
  PUBLISH_SERVICE_SECRET: string
  PUBLISH_PASSWORD_PEPPER: string
  PUBLISH_PASSWORD_SESSION_SECRET: string
  PUBLISH_FORM_INTENT_SECRET: string
}

interface SubtleCrypto {
  timingSafeEqual(
    left: ArrayBuffer | ArrayBufferView,
    right: ArrayBuffer | ArrayBufferView
  ): boolean
}

declare namespace Cloudflare {
  interface Env {
    RUNTIME_TICKET_SECRET: string
    PUBLISH_VIEWER_EXCHANGE_SECRET: string
    PUBLISH_SERVICE_SECRET: string
    PUBLISH_PASSWORD_PEPPER: string
    PUBLISH_PASSWORD_SESSION_SECRET: string
    PUBLISH_FORM_INTENT_SECRET: string
  }
}
