import crypto from "crypto"
import fs from "fs/promises"
import path from "path"
import { app, safeStorage } from "electron"
import { OAUTH_CONFIG } from "@/lib/const"

// PKCE utilities
function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

function sha256(str: string): Buffer {
  return crypto.createHash("sha256").update(str).digest()
}

export interface PKCEParams {
  codeVerifier: string
  codeChallenge: string
  codeChallengeMethod: "S256"
}

export interface OAuthTokens {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  id_token?: string
  // Internal field to track when tokens were stored
  _stored_at?: number
}

export interface UserInfo {
  id: string
  email?: string
  name?: string
  picture?: string
  [key: string]: any
}

export interface SyncBucketCredentials {
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
  tokenId: string
  endpoint: string
}

const TOKENS_DIR = "auth"
const TOKENS_FILE_NAME = "oauth_tokens.bin"
const SYNC_CREDENTIALS_FILE_NAME = "sync_credentials.bin"
let warnedAboutPlaintextStorage = false

async function ensureAppReady() {
  if (!app.isReady()) {
    await app.whenReady()
  }
}

async function getTokensFilePath(): Promise<string> {
  await ensureAppReady()
  return path.join(app.getPath("userData"), TOKENS_DIR, TOKENS_FILE_NAME)
}

async function getSyncCredentialsFilePath(
  providerId: string = "eidos.space"
): Promise<string> {
  await ensureAppReady()
  return path.join(
    app.getPath("userData"),
    TOKENS_DIR,
    providerId,
    SYNC_CREDENTIALS_FILE_NAME
  )
}

async function writeSecureTokens(tokensJson: string): Promise<void> {
  const filePath = await getTokensFilePath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })

  const encryptionAvailable = safeStorage.isEncryptionAvailable()
  if (!encryptionAvailable && !warnedAboutPlaintextStorage) {
    console.warn(
      "Electron safeStorage encryption unavailable; storing tokens unencrypted on disk."
    )
    warnedAboutPlaintextStorage = true
  }

  const payload = encryptionAvailable
    ? safeStorage.encryptString(tokensJson)
    : Buffer.from(tokensJson, "utf-8")

  await fs.writeFile(filePath, payload)
}

async function readSecureTokens(): Promise<string | null> {
  try {
    const filePath = await getTokensFilePath()
    const raw = await fs.readFile(filePath)
    if (!raw?.length) {
      return null
    }

    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString("utf-8")
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null
    }
    console.error("Failed to read stored tokens:", error)
    return null
  }
}

async function clearSecureTokens(): Promise<void> {
  try {
    const filePath = await getTokensFilePath()
    await fs.unlink(filePath)
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.warn("Failed to clear stored tokens:", error)
    }
  }
}

async function writeSecureSyncCredentials(
  credentialsJson: string,
  providerId: string = "eidos.space"
): Promise<void> {
  const filePath = await getSyncCredentialsFilePath(providerId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })

  const encryptionAvailable = safeStorage.isEncryptionAvailable()
  if (!encryptionAvailable && !warnedAboutPlaintextStorage) {
    console.warn(
      "Electron safeStorage encryption unavailable; storing sync credentials unencrypted on disk."
    )
    warnedAboutPlaintextStorage = true
  }

  const payload = encryptionAvailable
    ? safeStorage.encryptString(credentialsJson)
    : Buffer.from(credentialsJson, "utf-8")

  await fs.writeFile(filePath, payload)
}

async function readSecureSyncCredentials(
  providerId: string = "eidos.space"
): Promise<string | null> {
  try {
    const filePath = await getSyncCredentialsFilePath(providerId)
    const raw = await fs.readFile(filePath)
    if (!raw?.length) {
      return null
    }

    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString("utf-8")
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null
    }
    console.error("Failed to read stored sync credentials:", error)
    return null
  }
}

async function clearSecureSyncCredentials(
  providerId: string = "eidos.space"
): Promise<void> {
  try {
    const filePath = await getSyncCredentialsFilePath(providerId)
    await fs.unlink(filePath)
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.warn("Failed to clear stored sync credentials:", error)
    }
  }
}

// In-memory storage for PKCE code_verifier (temporary, only needed during auth flow)
let pendingCodeVerifier: string | null = null

/**
 * CredentialsManager handles secure storage of OAuth tokens and user information
 * using Electron safeStorage (encrypted payload written to disk)
 */
export class CredentialsManager {
  /**
   * Generate PKCE code_verifier and code_challenge
   */
  static generatePKCE(): PKCEParams {
    // Generate a random code_verifier (43-128 characters)
    const codeVerifier = base64URLEncode(crypto.randomBytes(32))
    // Generate code_challenge using S256 method
    const codeChallenge = base64URLEncode(sha256(codeVerifier))

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: "S256",
    }
  }

  /**
   * Store PKCE code_verifier temporarily in memory during auth flow
   */
  static setCodeVerifier(codeVerifier: string): void {
    pendingCodeVerifier = codeVerifier
  }

  /**
   * Retrieve and clear PKCE code_verifier (one-time use)
   */
  static getAndClearCodeVerifier(): string | null {
    const codeVerifier = pendingCodeVerifier
    pendingCodeVerifier = null // Clear after retrieval
    return codeVerifier
  }
  /**
   * Store OAuth tokens securely using Electron safeStorage
   */
  static async setTokens(tokens: OAuthTokens): Promise<void> {
    try {
      // Add storage timestamp for expiration tracking
      const tokensWithTimestamp = {
        ...tokens,
        _stored_at: Date.now(),
      }
      const tokensJson = JSON.stringify(tokensWithTimestamp)
      await writeSecureTokens(tokensJson)
    } catch (error) {
      console.error("Failed to store OAuth tokens:", error)
      throw new Error("Failed to securely store authentication tokens")
    }
  }

  /**
   * Internal helper to read raw tokens (with metadata) from disk
   */
  private static async readStoredTokens(): Promise<OAuthTokens | null> {
    const tokensJson = await readSecureTokens()
    if (!tokensJson) {
      return null
    }

    try {
      return JSON.parse(tokensJson) as OAuthTokens
    } catch (error) {
      console.error("Failed to parse stored tokens:", error)
      return null
    }
  }

  /**
   * Retrieve OAuth tokens from disk
   */
  static async getTokens(): Promise<OAuthTokens | null> {
    try {
      const tokens = await this.readStoredTokens()
      if (!tokens) return null
      // Remove internal timestamp before returning
      const { _stored_at, ...publicTokens } = tokens
      return publicTokens
    } catch (error) {
      console.error("Failed to retrieve OAuth tokens:", error)
      return null
    }
  }

  /**
   * Store user information in the config (non-sensitive info)
   * Sensitive tokens are stored separately via safeStorage
   */
  static async setUserInfo(userInfo: UserInfo): Promise<void> {
    const { getConfigManager } = await import("./config")
    const configManager = getConfigManager()
    configManager.setUser(userInfo)
  }

  /**
   * Get user information from config
   */
  static async getUserInfo(): Promise<UserInfo | null> {
    const { getConfigManager } = await import("./config")
    const configManager = getConfigManager()
    return configManager.getUser()
  }

  /**
   * Check if user is authenticated by checking both user info and tokens
   */
  static async isAuthenticated(): Promise<boolean> {
    const userInfo = await this.getUserInfo()
    const tokens = await this.getTokens()
    return !!(userInfo && tokens?.access_token)
  }

  /**
   * Clear all authentication data (logout)
   */
  static async clearAll(): Promise<void> {
    try {
      // Remove tokens from disk
      await clearSecureTokens()
    } catch (error) {
      console.warn("Failed to clear tokens from storage:", error)
    }

    // Clear user info from config
    const { getConfigManager } = await import("./config")
    const configManager = getConfigManager()
    configManager.setUser(undefined)
  }

  /**
   * Refresh tokens if refresh token is available
   * Note: PKCE public clients don't use client_secret for refresh
   */
  static async refreshTokens(): Promise<OAuthTokens | null> {
    const tokens = await this.getTokens()
    if (!tokens?.refresh_token) {
      console.warn("No refresh token available")
      return null
    }

    try {
      const tokenUrl = `${OAUTH_CONFIG.AUTH_SERVER_BASE_URL}${OAUTH_CONFIG.ENDPOINTS.TOKEN}`
      const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: OAUTH_CONFIG.CLIENT_ID,
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
        }),
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text()
        console.error("Token refresh failed:", error)
        // If refresh fails, clear all tokens to force re-authentication
        await this.clearAll()
        return null
      }

      const newTokens: OAuthTokens = await tokenResponse.json()

      // Merge with existing tokens, preserving any additional fields
      const updatedTokens = {
        ...tokens,
        ...newTokens,
        // Update refresh token if a new one was provided
        refresh_token: newTokens.refresh_token || tokens.refresh_token,
      }

      // Store the refreshed tokens
      await this.setTokens(updatedTokens)
      console.log("Tokens refreshed successfully")
      return updatedTokens
    } catch (error) {
      console.error("Error refreshing tokens:", error)
      // If refresh fails due to network error, don't clear tokens immediately
      // Let the caller decide what to do
      return null
    }
  }

  /**
   * Check if access token is expired or expiring soon
   */
  static async isAccessTokenExpired(): Promise<boolean> {
    try {
      const tokens = await this.readStoredTokens()
      if (!tokens) return true // No tokens means expired
      if (!tokens.access_token || !tokens.expires_in || !tokens._stored_at) {
        return false // If we don't have expiration info, assume it's valid (backward compatibility)
      }

      const storedAt = tokens._stored_at
      const expiresAt = storedAt + tokens.expires_in * 1000
      const now = Date.now()

      // Add a buffer to refresh tokens before they actually expire
      return now >= expiresAt - OAUTH_CONFIG.TOKEN_REFRESH_BUFFER_MS
    } catch (error) {
      console.error("Error checking token expiration:", error)
      return true // On error, assume expired for safety
    }
  }

  /**
   * Get access token, refreshing if necessary
   */
  static async getAccessToken(): Promise<string | null> {
    const tokens = await this.getTokens()
    if (!tokens?.access_token) {
      return null
    }

    // Check if token needs refresh
    if (await this.isAccessTokenExpired()) {
      console.log("Access token expired or expiring soon, attempting refresh")
      const refreshedTokens = await this.refreshTokens()
      if (refreshedTokens?.access_token) {
        return refreshedTokens.access_token
      } else {
        console.warn("Failed to refresh tokens")
        return null
      }
    }

    return tokens.access_token
  }

  /**
   * Store sync bucket credentials securely
   */
  static async setSyncCredentials(
    credentials: SyncBucketCredentials,
    providerId: string = "eidos.space"
  ): Promise<void> {
    try {
      const credentialsJson = JSON.stringify(credentials)
      await writeSecureSyncCredentials(credentialsJson, providerId)
    } catch (error) {
      console.error("Failed to store sync credentials:", error)
      throw new Error("Failed to securely store sync credentials")
    }
  }

  /**
   * Retrieve sync bucket credentials from disk
   */
  static async getSyncCredentials(
    providerId: string = "eidos.space"
  ): Promise<SyncBucketCredentials | null> {
    try {
      const credentialsJson = await readSecureSyncCredentials(providerId)
      if (!credentialsJson) {
        return null
      }

      return JSON.parse(credentialsJson) as SyncBucketCredentials
    } catch (error) {
      console.error("Failed to retrieve sync credentials:", error)
      return null
    }
  }

  /**
   * Clear sync bucket credentials
   */
  static async clearSyncCredentials(
    providerId: string = "eidos.space"
  ): Promise<void> {
    try {
      await clearSecureSyncCredentials(providerId)
    } catch (error) {
      console.warn("Failed to clear sync credentials from storage:", error)
    }
  }

  /**
   * Check if sync credentials are available
   */
  static async hasSyncCredentials(
    providerId: string = "eidos.space"
  ): Promise<boolean> {
    const credentials = await this.getSyncCredentials(providerId)
    return !!credentials
  }
}
