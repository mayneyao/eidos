export interface SpaceInfo {
  id: string
  name: string
  path: string
  sync?: {
    enabled: boolean
    // just like git remote url
    // https://eidos.space/username/volume.graft
    remote: string
  }
}

export interface SpacesConfig {
  spaces: SpaceInfo[]
}

export interface GlobalConfig {
  lastOpenedSpace?: string
}
