import { EIDOS_LITE_OAUTH_CLIENT_ID, EidosOAuthClient } from "./oauth-client"
import { EIDOS_LITE_SERVICE_ENVIRONMENTS } from "../../shared/service-environment"

const staging = EIDOS_LITE_SERVICE_ENVIRONMENTS.staging

function discovery(
  issuer: string = staging.accountOrigin
): Record<string, unknown> {
  return {
    issuer,
    authorization_endpoint: `${issuer}/api/auth/oauth2/authorize`,
    token_endpoint: `${issuer}/api/auth/oauth2/token`,
    userinfo_endpoint: `${issuer}/api/auth/oauth2/userinfo`,
    registration_endpoint: `${issuer}/api/auth/oauth2/register`,
    end_session_endpoint: `${issuer}/api/auth/oauth2/endsession`,
    code_challenge_methods_supported: ["S256"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
  }
}

describe("EidosOAuthClient", () => {
  it("builds an environment-bound authorization code + PKCE request", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(discovery(), { status: 200 })
    )
    const client = new EidosOAuthClient(staging, fetchImpl)
    const request = await client.createAuthorizationRequest(
      "http://127.0.0.1:13128/oauth/callback"
    )
    const url = new URL(request.url)
    expect(url.origin).toBe(staging.accountOrigin)
    expect(url.searchParams.get("client_id")).toBe(EIDOS_LITE_OAUTH_CLIENT_ID)
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/)
    expect(request.codeVerifier).toMatch(/^[\w-]{43}$/)
    expect(request.state.length).toBeGreaterThanOrEqual(32)
  })

  it("exchanges and refreshes tokens without surfacing them in URLs", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      if (url.endsWith("openid-configuration")) {
        return Response.json(discovery())
      }
      if (url.endsWith("/token")) {
        return Response.json({
          access_token: "access-secret",
          refresh_token: "refresh-secret",
          token_type: "Bearer",
          expires_in: 3600,
        })
      }
      if (url.includes("/avatar/")) {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" },
        })
      }
      return Response.json({
        sub: "user-1",
        email: "user@example.test",
        name: "Eidos User",
        picture: "https://eidos.space/avatar/user-1.png",
      })
    }) as unknown as typeof fetch
    const client = new EidosOAuthClient(staging, fetchImpl)
    const tokens = await client.exchangeCode(
      "authorization-code",
      "verifier",
      "http://127.0.0.1:13128/oauth/callback"
    )
    expect(tokens).toMatchObject({
      accessToken: "access-secret",
      refreshToken: "refresh-secret",
      expiresIn: 3600,
    })
    const tokenBody = String(requests[1]?.init?.body)
    expect(tokenBody).toContain("code=authorization-code")
    expect(tokenBody).toContain("code_verifier=verifier")
    expect(requests[1]?.url).not.toContain("authorization-code")
    await expect(client.userInfo(tokens.accessToken)).resolves.toEqual({
      id: "user-1",
      email: "user@example.test",
      name: "Eidos User",
      avatarUrl: "https://eidos.space/avatar/user-1.png",
      avatarDataUrl: "data:image/png;base64,iVBORw==",
    })
  })

  it("rejects discovery that crosses the selected environment", async () => {
    const client = new EidosOAuthClient(
      staging,
      vi.fn(async () => Response.json(discovery("https://eidos.space")))
    )
    await expect(client.discover()).rejects.toThrow("unexpected issuer")
  })
})
