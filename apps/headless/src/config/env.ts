import path from "node:path"

export interface HeadlessConfig {
  // S3 credentials (used by Graft)
  awsAccessKeyId: string
  awsSecretAccessKey: string
  awsEndpoint: string
  awsRegion: string

  // Graft storage location
  s3BucketName: string
  s3Prefix: string
  s3FilesPrefix: string

  // Legacy remote log ID. New Graft versions clone from a remote URI instead.
  remoteLogId: string

  // Server config
  port: number
  host: string

  // Data directory
  dataDir: string

  // Extension rendering
  compiledUiDir: string
  extensionHostnamePattern?: string
  sandboxHostnamePattern?: string

  // API Authentication
  apiKey?: string

  // Custom domain for file access
  s3CustomDomain?: string
}

export function loadConfig(): HeadlessConfig {
  // Diagnostic log for all environment variables (keys only or masked values)
  console.log("[Config] Environment Diagnostic:")
  Object.keys(process.env)
    .sort()
    .forEach((key) => {
      const value = process.env[key]
      const isSecret =
        key.includes("KEY") ||
        key.includes("SECRET") ||
        key.includes("PASSWORD") ||
        key.includes("TOKEN")
      const displayValue = isSecret
        ? `[REDACTED] (length: ${value?.length || 0})`
        : value
      if (
        key.startsWith("AWS_") ||
        key.startsWith("S3_") ||
        key.includes("PORT") ||
        key.includes("PATTERN") ||
        key.includes("API")
      ) {
        console.log(`  ${key}: ${displayValue}`)
      }
    })

  const config: HeadlessConfig = {
    awsAccessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
    awsSecretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
    awsEndpoint: (process.env.AWS_ENDPOINT || "https://s3.eidos.space").trim(),
    awsRegion: (process.env.AWS_REGION || "auto").trim(),
    s3BucketName: (process.env.S3_BUCKET_NAME || "eidos-sync").trim(),
    s3Prefix: (process.env.S3_PREFIX || "").trim(),
    s3FilesPrefix: (
      process.env.S3_FILES_PREFIX ||
      (process.env.S3_PREFIX || "").replace("/.graft", "")
    ).trim(),
    remoteLogId: (process.env.REMOTE_LOG_ID || "").trim(),
    port: parseInt(process.env.PORT || "3000", 10),
    host: process.env.HOST || "0.0.0.0",
    dataDir: process.env.DATA_DIR || "./data",
    compiledUiDir:
      process.env.COMPILED_UI_DIR || path.join(process.cwd(), "compiled-ui"),
    extensionHostnamePattern:
      (process.env.EXTENSION_HOSTNAME_PATTERN || "").trim() || undefined,
    sandboxHostnamePattern:
      (process.env.SANDBOX_HOSTNAME_PATTERN || "").trim() || undefined,
    apiKey: (process.env.API_KEY || "").trim() || undefined,
    s3CustomDomain: (process.env.S3_CUSTOM_DOMAIN || "").trim() || undefined,
  }

  // Validate required fields
  const missing: string[] = []
  if (!config.awsAccessKeyId) missing.push("AWS_ACCESS_KEY_ID")
  if (!config.awsSecretAccessKey) missing.push("AWS_SECRET_ACCESS_KEY")
  if (!config.s3Prefix) missing.push("S3_PREFIX")
  if (!config.apiKey) missing.push("API_KEY")

  if (missing.length > 0) {
    console.warn(`Missing environment variables: ${missing.join(", ")}`)
    console.warn("Graft sync may not work properly.")
  }

  return config
}

/**
 * Generate a Graft remote URI from config.
 */
export function getGraftRemoteUri(config: HeadlessConfig): string {
  const prefix = config.s3Prefix.replace(/^\/+|\/+$/g, "")
  const endpoint = encodeURIComponent(config.awsEndpoint)
  return `s3_compatible://${config.s3BucketName}/${prefix}?endpoint=${endpoint}`
}

/**
 * Apply Graft environment variables
 */
export function applyGraftEnv(config: HeadlessConfig): string {
  delete process.env.GRAFT_CONFIG
  process.env.AWS_ACCESS_KEY_ID = config.awsAccessKeyId
  process.env.AWS_SECRET_ACCESS_KEY = config.awsSecretAccessKey
  process.env.AWS_ENDPOINT = config.awsEndpoint
  process.env.AWS_ENDPOINT_URL = config.awsEndpoint
  process.env.AWS_REGION = config.awsRegion

  const remoteUri = getGraftRemoteUri(config)
  console.log(`[Config] GRAFT_REMOTE=${remoteUri}`)
  console.log(`[Config] AWS_ENDPOINT=${config.awsEndpoint}`)
  console.log(`[Config] S3_BUCKET=${config.s3BucketName}`)
  console.log(`[Config] S3_PREFIX=${config.s3Prefix}`)
  return remoteUri
}
