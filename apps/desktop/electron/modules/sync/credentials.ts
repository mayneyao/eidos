/**
 * Credentials Manager - Manages secure credentials storage
 * Simplified version for DI demo
 */

import { Injectable } from "../../common/di"

interface SyncCredentials {
  endpoint: string
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
  tokenId: string
  region?: string
}

@Injectable()
export class CredentialsManager {
  private credentials = new Map<string, SyncCredentials>()
  private tokens: any = null
  private userInfo: any = null

  async setSyncCredentials(
    credentials: SyncCredentials,
    providerId: string
  ): Promise<void> {
    this.credentials.set(providerId, credentials)
  }

  async getSyncCredentials(
    providerId: string
  ): Promise<SyncCredentials | null> {
    return this.credentials.get(providerId) || null
  }

  async clearSyncCredentials(providerId: string): Promise<void> {
    this.credentials.delete(providerId)
  }

  async hasSyncCredentials(providerId: string): Promise<boolean> {
    return this.credentials.has(providerId)
  }

  async setTokens(tokens: any): Promise<void> {
    this.tokens = tokens
  }

  async getTokens(): Promise<any> {
    return this.tokens
  }

  async setUserInfo(userInfo: any): Promise<void> {
    this.userInfo = userInfo
  }

  async getUserInfo(): Promise<any> {
    return this.userInfo
  }

  async isAuthenticated(): Promise<boolean> {
    return !!this.tokens
  }

  async clearAll(): Promise<void> {
    this.credentials.clear()
    this.tokens = null
    this.userInfo = null
  }

  async getAccessToken(): Promise<string | null> {
    return this.tokens?.access_token || null
  }
}

// Backward compatibility: singleton instance
let credentialsManagerInstance: CredentialsManager | null = null

export function getCredentialsManager(): CredentialsManager {
  if (!credentialsManagerInstance) {
    credentialsManagerInstance = new CredentialsManager()
  }
  return credentialsManagerInstance
}
