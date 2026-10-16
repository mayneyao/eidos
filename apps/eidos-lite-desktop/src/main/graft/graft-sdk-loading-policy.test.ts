import { describe, expect, it } from "vitest"
import { applyGraftSdkLoadingPolicy } from "./graft-sdk-loading-policy"

describe("Graft SDK executable source policy", () => {
  it("removes inherited code overrides from production before package loading", () => {
    const variables: NodeJS.ProcessEnv = {
      GRAFT_SDK_NATIVE_PATH: "/untrusted/native.node",
      EIDOS_LITE_GRAFT_SDK_PATH: "/untrusted/wrapper.js",
      NODE_ENV: "development",
      VITEST: "1",
    }
    applyGraftSdkLoadingPolicy({
      sourceExecution: false,
      environment: "production",
      variables,
      bundledStagingBinding: "/app/resources/staging.node",
      sourceSnapshot: true,
    })
    expect(variables.GRAFT_SDK_NATIVE_PATH).toBeUndefined()
    expect(variables.EIDOS_LITE_GRAFT_SDK_PATH).toBeUndefined()
  })

  it("allows a packaged staging resource without accepting inherited paths", () => {
    const variables: NodeJS.ProcessEnv = {
      GRAFT_SDK_NATIVE_PATH: "/untrusted/native.node",
    }
    applyGraftSdkLoadingPolicy({
      sourceExecution: false,
      environment: "staging",
      variables,
      bundledStagingBinding: "/app/resources/staging.node",
      sourceSnapshot: true,
    })
    expect(variables.GRAFT_SDK_NATIVE_PATH).toBe("/app/resources/staging.node")
  })

  it("ignores a stale staging resource when using the published package", () => {
    const variables: NodeJS.ProcessEnv = {
      GRAFT_SDK_NATIVE_PATH: "/untrusted/native.node",
    }
    applyGraftSdkLoadingPolicy({
      sourceExecution: false,
      environment: "staging",
      variables,
      bundledStagingBinding: "/app/resources/old-snapshot.node",
      sourceSnapshot: false,
    })
    expect(variables.GRAFT_SDK_NATIVE_PATH).toBeUndefined()
  })

  it("preserves explicit source-test overrides", () => {
    const variables: NodeJS.ProcessEnv = {
      GRAFT_SDK_NATIVE_PATH: "/local/test.node",
      EIDOS_LITE_GRAFT_SDK_PATH: "/local/sdk",
    }
    applyGraftSdkLoadingPolicy({
      sourceExecution: true,
      environment: "staging",
      variables,
      bundledStagingBinding: "/app/resources/staging.node",
    })
    expect(variables.GRAFT_SDK_NATIVE_PATH).toBe("/local/test.node")
    expect(variables.EIDOS_LITE_GRAFT_SDK_PATH).toBe("/local/sdk")
  })
})
