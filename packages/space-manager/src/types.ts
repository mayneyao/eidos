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
    // Authoritative Eidos Sync HTTP Remote v1 URL returned by provisioning.
    remote: string
    // Product-level service identifier. Desktop supports eidos.space only.
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
