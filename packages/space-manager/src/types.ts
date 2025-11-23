export interface SpaceInfo {
  id: string;
  name: string;
  path: string;
}

export interface SpacesConfig {
  spaces: SpaceInfo[];
}

export interface GlobalConfig {
  lastOpenedSpace?: string;
}

