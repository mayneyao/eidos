import {
  EIDOS_LITE_SERVICE_ENVIRONMENTS,
  type EidosLiteServiceEnvironment,
} from "../../shared/service-environment"

interface GraftDiscovery {
  service: string
  protocol: string
  version: number
  remote_url_template: string
  authentication: {
    scheme: string
    authority: string
  }
}

interface OidcDiscovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  jwks_uri: string
  response_types_supported: string[]
  grant_types_supported: string[]
  code_challenge_methods_supported: string[]
  scopes_supported: string[]
}

const discoveryEnabled = process.env.EIDOS_LITE_RUN_SERVICE_DISCOVERY === "1"
const describeDiscovery = discoveryEnabled ? describe : describe.skip

async function expectDiscovery(
  environment: EidosLiteServiceEnvironment
): Promise<void> {
  const response = await fetch(
    `${environment.syncRemoteOrigin}/.well-known/graft`
  )
  expect(response.status).toBe(200)
  const discovery = (await response.json()) as GraftDiscovery
  expect(discovery).toEqual({
    service: "eidos-graft-remote",
    protocol: "graft-remote",
    version: 1,
    remote_url_template: `${environment.syncRemoteOrigin}/{namespace}/{repository}`,
    authentication: {
      scheme: "bearer",
      authority: environment.accountOrigin,
    },
  })
}

async function expectOidcDiscovery(
  environment: EidosLiteServiceEnvironment
): Promise<void> {
  const response = await fetch(
    `${environment.accountOrigin}/api/auth/.well-known/openid-configuration`
  )
  expect(response.status).toBe(200)
  const discovery = (await response.json()) as OidcDiscovery
  expect(discovery.issuer).toBe(environment.accountOrigin)
  expect(discovery.authorization_endpoint).toBe(
    `${environment.accountOrigin}/api/auth/oauth2/authorize`
  )
  expect(discovery.token_endpoint).toBe(
    `${environment.accountOrigin}/api/auth/oauth2/token`
  )
  expect(discovery.userinfo_endpoint).toBe(
    `${environment.accountOrigin}/api/auth/oauth2/userinfo`
  )
  expect(discovery.jwks_uri).toBe(`${environment.accountOrigin}/api/auth/jwks`)
  expect(discovery.response_types_supported).toContain("code")
  expect(discovery.grant_types_supported).toEqual(
    expect.arrayContaining(["authorization_code", "refresh_token"])
  )
  expect(discovery.code_challenge_methods_supported).toContain("S256")
  expect(discovery.scopes_supported).toEqual(
    expect.arrayContaining(["openid", "profile", "email", "offline_access"])
  )
}

describeDiscovery("official Eidos service discovery", () => {
  it("connects the current development preset to staging", async () => {
    const environment = EIDOS_LITE_SERVICE_ENVIRONMENTS.staging
    await Promise.all([
      expectDiscovery(environment),
      expectOidcDiscovery(environment),
    ])
  })

  it("keeps the production preset independently verifiable", async () => {
    const environment = EIDOS_LITE_SERVICE_ENVIRONMENTS.production
    await Promise.all([
      expectDiscovery(environment),
      expectOidcDiscovery(environment),
    ])
  })
})
