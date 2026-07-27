/**
 * Credentials Manager - Manages secure credentials storage
 * Uses Electron safeStorage for secure persistence
 */

import { app, safeStorage } from "electron"
import crypto from "crypto"
import fs from "fs/promises"
import path from "path"
import log from "electron-log"
import { Injectable, container } from "../../common/di"
import { OAUTH_CONFIG } from "@/lib/const"

export interface OAuthTokens {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  id_token?: string
  _stored_at?: number
}

export interface UserInfo {
  id: string
  email?: string
  name?: string
  picture?: string
  [key: string]: any
}

export interface PKCEParams {
  codeVerifier: string
  codeChallenge: string
  codeChallengeMethod: "S256"
}

const TOKENS_DIR = "auth"
const TOKENS_FILE_NAME = "oauth_tokens.bin"
let warnedAboutPlaintextStorage = false

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

// In-memory storage for PKCE code_verifier (temporary, only needed during auth flow)
let pendingCodeVerifier: string | null = null

async function ensureAppReady() {
  if (!app.isReady()) {
    await app.whenReady()
  }
}

async function getTokensFilePath(): Promise<string> {
  await ensureAppReady()
  return path.join(app.getPath("userData"), TOKENS_DIR, TOKENS_FILE_NAME)
}

async function writeSecureTokens(tokensJson: string): Promise<void> {
  const filePath = await getTokensFilePath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })

  const encryptionAvailable = safeStorage.isEncryptionAvailable()
  if (!encryptionAvailable && !warnedAboutPlaintextStorage) {
    log.warn(
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
    log.error("Failed to read stored tokens:", error)
    return null
  }
}

async function clearSecureTokens(): Promise<void> {
  try {
    const filePath = await getTokensFilePath()
    await fs.unlink(filePath)
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      log.warn("Failed to clear tokens from storage:", error)
    }
  }
}

const SECRETS_FILE_NAME = "secrets.bin"

async function getSecretsFilePath(): Promise<string> {
  await ensureAppReady()
  return path.join(app.getPath("userData"), TOKENS_DIR, SECRETS_FILE_NAME)
}

async function writeSecureSecrets(secretsJson: string): Promise<void> {
  const filePath = await getSecretsFilePath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })

  const encryptionAvailable = safeStorage.isEncryptionAvailable()
  if (!encryptionAvailable && !warnedAboutPlaintextStorage) {
    log.warn(
      "Electron safeStorage encryption unavailable; storing secrets unencrypted on disk."
    )
    warnedAboutPlaintextStorage = true
  }

  const payload = encryptionAvailable
    ? safeStorage.encryptString(secretsJson)
    : Buffer.from(secretsJson, "utf-8")

  await fs.writeFile(filePath, payload)
}

async function readSecureSecrets(): Promise<string | null> {
  try {
    const filePath = await getSecretsFilePath()
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
    log.error("Failed to read stored secrets:", error)
    return null
  }
}

@Injectable()
export class CredentialsManager {
  private instanceId = Math.random().toString(36).substring(2, 9)

  constructor() {
    console.log(`[CredentialsManager] Instance created: ${this.instanceId}`)
  }

  /**
   * Generate PKCE code_verifier and code_challenge
   */
  generatePKCE(): PKCEParams {
    const codeVerifier = base64URLEncode(crypto.randomBytes(32))
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
  setCodeVerifier(codeVerifier: string): void {
    pendingCodeVerifier = codeVerifier
  }

  /**
   * Retrieve and clear PKCE code_verifier (one-time use)
   */
  getAndClearCodeVerifier(): string | null {
    const codeVerifier = pendingCodeVerifier
    pendingCodeVerifier = null
    return codeVerifier
  }

  /**
   * Store OAuth tokens securely using Electron safeStorage
   */
  async setTokens(tokens: OAuthTokens): Promise<void> {
    console.log(`[CredentialsManager:${this.instanceId}] setTokens called`)
    try {
      const tokensWithTimestamp = {
        ...tokens,
        _stored_at: Date.now(),
      }
      const tokensJson = JSON.stringify(tokensWithTimestamp)
      await writeSecureTokens(tokensJson)
      console.log(
        `[CredentialsManager:${this.instanceId}] Tokens stored to disk`
      )
    } catch (error) {
      log.error("Failed to store OAuth tokens:", error)
      throw new Error("Failed to securely store authentication tokens")
    }
  }

  /**
   * Internal helper to read raw tokens from disk
   */
  private async readStoredTokens(): Promise<OAuthTokens | null> {
    const tokensJson = await readSecureTokens()
    if (!tokensJson) {
      return null
    }

    try {
      return JSON.parse(tokensJson) as OAuthTokens
    } catch (error) {
      log.error("Failed to parse stored tokens:", error)
      return null
    }
  }

  /**
   * Retrieve OAuth tokens from disk
   */
  async getTokens(): Promise<OAuthTokens | null> {
    try {
      const tokens = await this.readStoredTokens()
      if (!tokens) return null
      const { _stored_at, ...publicTokens } = tokens
      return publicTokens
    } catch (error) {
      log.error("Failed to retrieve OAuth tokens:", error)
      return null
    }
  }

  /**
   * Store user information
   */
  async setUserInfo(userInfo: UserInfo): Promise<void> {
    const { getConfigManager } = await import("../config/config-manager")
    const configManager = getConfigManager()
    configManager.setUser(userInfo)
  }

  /**
   * Get user information
   */
  async getUserInfo(): Promise<UserInfo | null> {
    const { getConfigManager } = await import("../config/config-manager")
    const configManager = getConfigManager()
    return configManager.getUser()
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const userInfo = await this.getUserInfo()
    const tokens = await this.getTokens()
    return !!(userInfo && tokens?.access_token)
  }

  /**
   * Clear all authentication data (logout)
   */
  async clearAll(): Promise<void> {
    try {
      await clearSecureTokens()
    } catch (error) {
      log.warn("Failed to clear tokens from storage:", error)
    }

    const { getConfigManager } = await import("../config/config-manager")
    const configManager = getConfigManager()
    configManager.setUser(undefined)
  }

  /**
   * Refresh tokens if refresh token is available
   */
  async refreshTokens(): Promise<OAuthTokens | null> {
    const tokens = await this.getTokens()
    if (!tokens?.refresh_token) {
      log.warn("No refresh token available")
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
        log.error(`Token refresh failed with HTTP ${tokenResponse.status}`)
        await this.clearAll()
        return null
      }

      const newTokens: OAuthTokens = await tokenResponse.json()

      const updatedTokens = {
        ...tokens,
        ...newTokens,
        refresh_token: newTokens.refresh_token || tokens.refresh_token,
      }

      await this.setTokens(updatedTokens)
      log.info("Tokens refreshed successfully")
      return updatedTokens
    } catch (error) {
      log.error("Error refreshing tokens:", error)
      return null
    }
  }

  /**
   * Check if access token is expired or expiring soon
   */
  async isAccessTokenExpired(): Promise<boolean> {
    try {
      const tokens = await this.readStoredTokens()
      if (!tokens) return true
      if (!tokens.access_token) return true
      if (!tokens.expires_in || !tokens._stored_at) return true

      const storedAt = tokens._stored_at
      const expiresAt = storedAt + tokens.expires_in * 1000
      const now = Date.now()

      return now >= expiresAt - OAUTH_CONFIG.TOKEN_REFRESH_BUFFER_MS
    } catch (error) {
      log.error("Error checking token expiration:", error)
      return true
    }
  }

  /**
   * Get access token, refreshing if necessary
   */
  async getAccessToken(): Promise<string | null> {
    const tokens = await this.getTokens()
    if (!tokens?.access_token) {
      console.log(
        `[CredentialsManager:${this.instanceId}] getAccessToken: no tokens found`
      )
      return null
    }

    if (await this.isAccessTokenExpired()) {
      log.info("Access token expired or expiring soon, attempting refresh")
      const refreshedTokens = await this.refreshTokens()
      if (refreshedTokens?.access_token) {
        return refreshedTokens.access_token
      } else {
        log.warn("Failed to refresh tokens")
        return null
      }
    }

    return tokens.access_token
  }

  /**
   * Store a custom secret key-value pair
   */
  async setSecret(key: string, value: string): Promise<void> {
    try {
      const secrets = await this.listSecrets()
      if (value) {
        secrets[key] = value
      } else {
        delete secrets[key]
      }
      await writeSecureSecrets(JSON.stringify(secrets))
    } catch (error) {
      log.error(`Failed to store secret for key ${key}:`, error)
      throw new Error(`Failed to securely store secret: ${key}`)
    }
  }

  /**
   * Retrieve a custom secret value by key
   */
  async getSecret(key: string): Promise<string | null> {
    try {
      const secrets = await this.listSecrets()
      return secrets[key] || null
    } catch (error) {
      log.error(`Failed to retrieve secret for key ${key}:`, error)
      return null
    }
  }

  /**
   * Retrieve all secrets
   */
  async listSecrets(): Promise<Record<string, string>> {
    try {
      const secretsJson = await readSecureSecrets()
      if (!secretsJson) {
        return {}
      }
      return JSON.parse(secretsJson) as Record<string, string>
    } catch (error) {
      log.error("Failed to list secrets:", error)
      return {}
    }
  }

  /**
   * Delete a secret by key
   */
  async deleteSecret(key: string): Promise<void> {
    try {
      const secrets = await this.listSecrets()
      delete secrets[key]
      await writeSecureSecrets(JSON.stringify(secrets))
    } catch (error) {
      log.error(`Failed to delete secret for key ${key}:`, error)
      throw new Error(`Failed to delete secret: ${key}`)
    }
  }
}

// Backward compatibility: singleton instance
let credentialsManagerInstance: CredentialsManager | null = null

/**
 * Get the CredentialsManager instance.
 * If DI container is initialized and has CredentialsManager bound, returns the DI instance.
 * Otherwise, falls back to a singleton instance for backward compatibility.
 */
export function getCredentialsManager(): CredentialsManager {
  // Try to get from DI container first (preferred)
  try {
    if (container.isBound(CredentialsManager)) {
      const instance = container.get(CredentialsManager)
      console.log(
        `[getCredentialsManager] Returning DI instance: ${(instance as any).instanceId}`
      )
      return instance
    }
  } catch (e) {
    // DI container not ready, fall back to singleton
    console.log(
      `[getCredentialsManager] DI container not ready, using singleton fallback`
    )
  }

  // Fallback: create singleton instance
  if (!credentialsManagerInstance) {
    credentialsManagerInstance = new CredentialsManager()
  }
  console.log(
    `[getCredentialsManager] Returning singleton instance: ${(credentialsManagerInstance as any).instanceId}`
  )
  return credentialsManagerInstance
}
