export interface StartupSpaceRegistry {
  validateSpace(spaceId: string): boolean
  getFirstValidSpace(): { id: string } | null
}

export interface LastOpenedSpaceStore {
  getLastOpenedSpace(): string | undefined
  setLastOpenedSpace(spaceId: string | undefined): void
}

export function resolveStartupSpaceId(
  protocolSpaceId: string | null,
  registry: StartupSpaceRegistry,
  config: LastOpenedSpaceStore
): string | undefined {
  let spaceId: string | undefined

  if (protocolSpaceId) {
    if (registry.validateSpace(protocolSpaceId)) {
      spaceId = protocolSpaceId
      console.log("Opening space from protocol URL:", spaceId)
      config.setLastOpenedSpace(spaceId)
    } else {
      console.warn(`Space from protocol URL not found: ${protocolSpaceId}`)
      spaceId = config.getLastOpenedSpace()
    }
  } else {
    spaceId = config.getLastOpenedSpace()
  }

  if (!spaceId) {
    spaceId = registry.getFirstValidSpace()?.id
    if (spaceId) config.setLastOpenedSpace(spaceId)
  }

  if (spaceId && !registry.validateSpace(spaceId)) {
    console.warn(
      `Space ${spaceId} is invalid, falling back to first available space`
    )
    spaceId = registry.getFirstValidSpace()?.id
    if (spaceId) config.setLastOpenedSpace(spaceId)
  }

  return spaceId
}
