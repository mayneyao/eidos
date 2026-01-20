import path from 'node:path'

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
  
  // Remote log ID for clone-from-remote (read-only mode)
  remoteLogId: string
  
  // Server config
  port: number
  host: string
  
  // Data directory
  dataDir: string

  // API Authentication
  apiKey?: string
}

export function loadConfig(): HeadlessConfig {
  const config: HeadlessConfig = {
    awsAccessKeyId: (process.env.AWS_ACCESS_KEY_ID || '').trim(),
    awsSecretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || '').trim(),
    awsEndpoint: (process.env.AWS_ENDPOINT || 'https://s3.eidos.space').trim(),
    awsRegion: (process.env.AWS_REGION || 'auto').trim(),
    s3BucketName: (process.env.S3_BUCKET_NAME || 'eidos-sync').trim(),
    s3Prefix: (process.env.S3_PREFIX || '').trim(),
    s3FilesPrefix: (process.env.S3_FILES_PREFIX || (process.env.S3_PREFIX || '').replace('/.graft', '')).trim(),
    remoteLogId: (process.env.REMOTE_LOG_ID || '').trim(),
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    dataDir: process.env.DATA_DIR || './data',
    apiKey: (process.env.API_KEY || '').trim() || undefined,
  }
  
  // Validate required fields
  const missing: string[] = []
  if (!config.awsAccessKeyId) missing.push('AWS_ACCESS_KEY_ID')
  if (!config.awsSecretAccessKey) missing.push('AWS_SECRET_ACCESS_KEY')
  if (!config.s3Prefix) missing.push('S3_PREFIX')
  if (!config.remoteLogId) missing.push('REMOTE_LOG_ID')
  if (!config.apiKey) missing.push('API_KEY')
  
  if (missing.length > 0) {
    console.warn(`Missing environment variables: ${missing.join(', ')}`)
    console.warn('Graft sync may not work properly.')
  }
  
  return config
}

/**
 * Generate graft.toml content from config
 */
export function generateGraftToml(config: HeadlessConfig, graftDataDir: string): string {
  return `data_dir = "${graftDataDir.replace(/\\/g, '/')}"
[remote]
type = "s3_compatible"
bucket = "${config.s3BucketName}"
prefix = "${config.s3Prefix}"
`
}

/**
 * Apply Graft environment variables
 */
export function applyGraftEnv(config: HeadlessConfig, graftConfigPath: string): void {
  const absoluteConfigPath = path.resolve(graftConfigPath)
  process.env.GRAFT_CONFIG = absoluteConfigPath
  process.env.AWS_ACCESS_KEY_ID = config.awsAccessKeyId
  process.env.AWS_SECRET_ACCESS_KEY = config.awsSecretAccessKey
  process.env.AWS_ENDPOINT = config.awsEndpoint
  process.env.AWS_ENDPOINT_URL = config.awsEndpoint
  process.env.AWS_REGION = config.awsRegion
  
  console.log(`[Config] GRAFT_CONFIG=${absoluteConfigPath}`)
  console.log(`[Config] AWS_ENDPOINT=${config.awsEndpoint}`)
  console.log(`[Config] S3_BUCKET=${config.s3BucketName}`)
  console.log(`[Config] S3_PREFIX=${config.s3Prefix}`)
}
