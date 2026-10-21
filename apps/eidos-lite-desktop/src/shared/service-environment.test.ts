import {
  EIDOS_LITE_SERVICE_ENVIRONMENTS,
  resolveEidosLiteServiceEnvironment,
  runtimeEnvironmentOverride,
  accountStorageKey,
  developmentAccountEnvironment,
} from "./service-environment"

describe("Eidos Lite service environments", () => {
  it("isolates explicit local account fixtures and ignores them in packaged apps", () => {
    const staging = EIDOS_LITE_SERVICE_ENVIRONMENTS.staging
    const local = developmentAccountEnvironment(
      staging,
      false,
      "https://fixture.example.test"
    )
    expect(local.accountOrigin).toBe("https://fixture.example.test")
    expect(accountStorageKey(local)).not.toBe(accountStorageKey(staging))
    expect(
      developmentAccountEnvironment(
        staging,
        true,
        "https://fixture.example.test"
      )
    ).toBe(staging)
    expect(() =>
      developmentAccountEnvironment(staging, false, "http://example.test")
    ).toThrow()
    expect(() =>
      developmentAccountEnvironment(
        staging,
        false,
        "https://user:password@example.test"
      )
    ).toThrow()
  })
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
    expect(runtimeEnvironmentOverride(true, "staging")).toBeNull()
    expect(runtimeEnvironmentOverride(true, "production")).toBeNull()
    expect(runtimeEnvironmentOverride(false, "production")).toBe("production")
  })

  it.each(["staging", "production", "http://localhost:8787"])(
    "does not re-read runtime override %s in a production package",
    (override) => {
      const previous = process.env.EIDOS_LITE_ENVIRONMENT
      process.env.EIDOS_LITE_ENVIRONMENT = override
      try {
        expect(
          resolveEidosLiteServiceEnvironment(
            runtimeEnvironmentOverride(true, override),
            "production"
          )
        ).toBe(EIDOS_LITE_SERVICE_ENVIRONMENTS.production)
        expect(
          resolveEidosLiteServiceEnvironment(
            runtimeEnvironmentOverride(true, override),
            "staging"
          )
        ).toBe(EIDOS_LITE_SERVICE_ENVIRONMENTS.staging)
      } finally {
        if (previous === undefined) delete process.env.EIDOS_LITE_ENVIRONMENT
        else process.env.EIDOS_LITE_ENVIRONMENT = previous
      }
    }
  )
})
