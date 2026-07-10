export interface RelayChannel {
  id: string
  handlerScriptId?: string
}

export interface RelayConfig {
  enabled: boolean
  channels: RelayChannel[]
}

export type SpaceMode = "legacy" | "file"

export interface SpaceInfo {
  id: string
  name: string
  path: string
  mode: SpaceMode
  sync?: {
    enabled: boolean
    // Remote storage path format: <provider-id>/<bucket-name>/<space-name>
    // e.g., 'eidos.space/mayne/my-space' or 'my-s3/my-bucket/my-space'
    remote: string
    // The sync provider ID used when sync was enabled (e.g., 'eidos.space', 'my-s3')
    provider?: string
  }
  versioning?: {
    enabled: boolean
  }
  relay?: RelayConfig
}

export type SpacePathConflictType = "same" | "inside" | "contains"

export interface SpacePathConflict {
  type: SpacePathConflictType
  space: SpaceInfo
}

export interface SpacesConfig {
  spaces: SpaceInfo[]
}

export interface GlobalConfig {
  lastOpenedSpace?: string
}
