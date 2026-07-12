import { OAUTH_CONFIG } from "@/lib/const"
import type { Hono } from "hono"
import type { ServerContext } from "../server"

// Simple PKCE implementation
let codeVerifierStore: string | null = null

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64URLEncode(array)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return base64URLEncode(new Uint8Array(hash))
}

function base64URLEncode(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

/**
 * Setup OAuth authentication routes
 */
export function setupOAuthRoutes(app: Hono, ctx: ServerContext) {
  // Initiate OAuth flow with PKCE
  app.get("/api/auth/login", async (c) => {
    try {
      const pkce = {
        codeVerifier: generateCodeVerifier(),
        codeChallenge: "",
        codeChallengeMethod: "S256" as const,
      }
      pkce.codeChallenge = await generateCodeChallenge(pkce.codeVerifier)
      codeVerifierStore = pkce.codeVerifier

      const authUrl = new URL(
        `${OAUTH_CONFIG.AUTH_SERVER_BASE_URL}${OAUTH_CONFIG.ENDPOINTS.AUTHORIZE}`
      )
      authUrl.searchParams.set("client_id", OAUTH_CONFIG.CLIENT_ID)
      authUrl.searchParams.set("redirect_uri", OAUTH_CONFIG.REDIRECT_URI)
      authUrl.searchParams.set("response_type", "code")
      authUrl.searchParams.set("scope", OAUTH_CONFIG.SCOPES)
      authUrl.searchParams.set("code_challenge", pkce.codeChallenge)
      authUrl.searchParams.set(
        "code_challenge_method",
        pkce.codeChallengeMethod
      )
      authUrl.searchParams.set("prompt", "consent")

      return c.json({ url: authUrl.toString() })
    } catch (error: any) {
      return c.json({ error: error.message }, 500)
    }
  })

  // OAuth callback
  app.get("/oauth/callback", async (c) => {
    const url = new URL(c.req.url)
    const code = url.searchParams.get("code")
    const error = url.searchParams.get("error")

    if (error) {
      const errorDescription =
        url.searchParams.get("error_description") || error
      return c.html(`
        <html>
          <body>
            <h1>Login Failed</h1>
            <p>${errorDescription}</p>
            <p>You can close this window and try again.</p>
          </body>
        </html>
      `)
    }

    if (!code) {
      return c.text("No code provided", 400)
    }

    try {
      const codeVerifier = codeVerifierStore
      codeVerifierStore = null
      if (!codeVerifier) {
        return c.text(
          "PKCE code_verifier not found. Please start the login process again.",
          400
        )
      }

      const tokenUrl = `${OAUTH_CONFIG.AUTH_SERVER_BASE_URL}${OAUTH_CONFIG.ENDPOINTS.TOKEN}`
      const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: OAUTH_CONFIG.CLIENT_ID,
          redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
          grant_type: "authorization_code",
          code: code,
          code_verifier: codeVerifier,
        }),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        return c.text(`Token exchange failed: ${errorText}`, 500)
      }

      const tokens = await tokenResponse.json()
      ctx.logger.info("tokens", tokens)
      await ctx.credentialsManager.setTokens(tokens)

      const userInfoUrl = `${OAUTH_CONFIG.AUTH_SERVER_BASE_URL}${OAUTH_CONFIG.ENDPOINTS.USERINFO}`
      const userInfoResponse = await fetch(userInfoUrl, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      })

      let user = null
      if (userInfoResponse.ok) {
        user = await userInfoResponse.json()
        await ctx.credentialsManager.setUserInfo(user!)
      } else {
        ctx.logger.error("Failed to fetch user info")
      }

      ctx.broadcastAuthStateChange(true, user)

      return c.html(`
        <html>
          <body>
            <h1>Login Successful</h1>
            <p>You can close this window and return to Eidos.</p>
          </body>
        </html>
      `)
    } catch (error: any) {
      return c.text(`Authentication error: ${error.message}`, 500)
    }
  })

  // Get current user
  app.get("/api/auth/user", async (c) => {
    try {
      const accessToken = await ctx.credentialsManager.getAccessToken()
      if (!accessToken) {
        ctx.broadcastAuthStateChange(false, null)
        return c.json({ authenticated: false }, 401)
      }

      const user = await ctx.credentialsManager.getUserInfo()

      return c.json({
        authenticated: true,
        user: user,
        hasValidTokens: true,
      })
    } catch (error: any) {
      ctx.logger.error("Error checking authentication status:", error)
      return c.json({ authenticated: false, error: error.message }, 500)
    }
  })

  // Logout
  app.post("/api/auth/logout", async (c) => {
    try {
      const tokens = await ctx.credentialsManager.getTokens()

      if (tokens?.id_token) {
        try {
          const endSessionUrl = new URL(
            `${OAUTH_CONFIG.AUTH_SERVER_BASE_URL}${OAUTH_CONFIG.ENDPOINTS.END_SESSION}`
          )
          endSessionUrl.searchParams.set("id_token_hint", tokens.id_token)
          await fetch(endSessionUrl.toString(), { method: "GET" })
        } catch (endSessionError) {
          ctx.logger.error("Failed to end session on server:", endSessionError)
        }
      }

      await ctx.credentialsManager.clearAll()
      ctx.broadcastAuthStateChange(false, null)
      return c.json({ success: true })
    } catch (error: any) {
      ctx.logger.error("Error during logout:", error)
      return c.json({ success: false, error: error.message }, 500)
    }
  })

  // Get access token
  app.get("/api/auth/token", async (c) => {
    try {
      const accessToken = await ctx.credentialsManager.getAccessToken()
      if (!accessToken) {
        ctx.broadcastAuthStateChange(false, null)
        return c.json({ error: "Failed to get access token" }, 401)
      }

      return c.json({ access_token: accessToken })
    } catch (error: any) {
      ctx.logger.error("Error getting access token:", error)
      return c.json({ error: error.message }, 500)
    }
  })
}
