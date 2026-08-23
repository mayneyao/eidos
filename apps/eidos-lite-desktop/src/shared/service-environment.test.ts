import {
  EIDOS_LITE_SERVICE_ENVIRONMENTS,
  resolveEidosLiteServiceEnvironment,
  runtimeEnvironmentOverride,
} from "./service-environment"

describe("Eidos Lite service environments", () => {
  it("defaults development and unsigned builds to the fixed staging preset", () => {
    expect(resolveEidosLiteServiceEnvironment(undefined, "staging")).toEqual({
      name: "staging",
      accountOrigin: "https://staging.eidos.space",
      billingOrigin: "https://staging.eidos.space",
      publishOrigin: "https://publish-staging.eidos.space",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
    })
  })

  it("switches every control and data plane together", () => {
    expect(resolveEidosLiteServiceEnvironment("production")).toBe(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.production
    )
    expect(resolveEidosLiteServiceEnvironment("staging")).toBe(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.staging
    )
  })

  it("rejects arbitrary environments instead of accepting custom services", () => {
    expect(() =>
      resolveEidosLiteServiceEnvironment("http://localhost:8787")
    ).toThrow('must be "staging" or "production"')
  })

  it("keeps packaged applications on their compiled environment", () => {
    expect(runtimeEnvironmentOverride(true, "staging")).toBeUndefined()
    expect(runtimeEnvironmentOverride(true, "production")).toBeUndefined()
    expect(runtimeEnvironmentOverride(false, "production")).toBe("production")
  })
})
