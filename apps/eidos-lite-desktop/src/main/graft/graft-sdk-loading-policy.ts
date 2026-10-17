import type { EidosLiteEnvironmentName } from "../../shared/service-environment"

export function applyGraftSdkLoadingPolicy({
  sourceExecution,
  environment,
  variables,
  bundledStagingBinding,
  sourceSnapshot = false,
}: {
  sourceExecution: boolean
  environment: EidosLiteEnvironmentName
  variables: NodeJS.ProcessEnv
  bundledStagingBinding?: string
  sourceSnapshot?: boolean
}): void {
  if (!sourceExecution) {
    // Environment inherited by the packaged app must not choose executable code.
    delete variables.GRAFT_SDK_NATIVE_PATH
    delete variables.EIDOS_LITE_GRAFT_SDK_PATH
  }
  if (
    environment === "staging" &&
    sourceSnapshot &&
    bundledStagingBinding &&
    !variables.GRAFT_SDK_NATIVE_PATH?.trim()
  )
    variables.GRAFT_SDK_NATIVE_PATH = bundledStagingBinding
}
