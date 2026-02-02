export interface SpaceInfo {
  id: string
  name: string
  path: string
  sync?: {
    enabled: boolean
    // Remote storage path format: <provider-id>/<bucket-name>/<space-name>
    // e.g., 'eidos.space/mayne/my-space' or 'my-s3/my-bucket/my-space'
    remote: string
    // The sync provider ID used when sync was enabled (e.g., 'eidos.space', 'my-s3')
    provider?: string
  }
}

export interface SpacesConfig {
  spaces: SpaceInfo[]
}

export interface GlobalConfig {
  lastOpenedSpace?: string
}
