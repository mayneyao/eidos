declare const __EIDOS_LITE_UPDATES_ENABLED__: boolean | undefined

export function eidosLiteUpdatesEnabledInBuild(): boolean {
  return (
    typeof __EIDOS_LITE_UPDATES_ENABLED__ === "boolean" &&
    __EIDOS_LITE_UPDATES_ENABLED__
  )
}
