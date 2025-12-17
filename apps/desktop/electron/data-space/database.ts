import { type EidosDatabase } from "@/packages/core/data-space"

import { CredentialsManager } from "../credentials"
import { getSpacePath } from "../file-system/space"
import { getResourcePath } from "../helper"
import { getSpaceRegistry, type SpaceInfo } from "../space-registry"
import { NodeServerDatabase } from "../sqlite-server"

interface DatabaseOptions {
  enableSync?: boolean
  syncOptions?: { remote?: string; volumeId?: string }
  spaceId: string
}

export async function createDatabase({
  spaceId,
  enableSync = false,
  syncOptions,
}: DatabaseOptions): Promise<EidosDatabase> {
  const libPath = getResourcePath(`dist-sqlite-ext/libsimple`)
  const dictPath = getResourcePath("dist-sqlite-ext/dict")
  const graftLibPath = getResourcePath("dist-sqlite-ext/libgraft")
  const vecLibPath = getResourcePath("dist-sqlite-ext/libvec")

  const credentials = await CredentialsManager.getSyncCredentials("eidos.space")
  if (!credentials) {
    throw new Error(`Credentials for eidos.space not found`)
  }

  const spaceInfo = getSpaceRegistry().getSpace(spaceId)
  if (!spaceInfo) {
    throw new Error(`Space not found: ${spaceId}`)
  }

  return NodeServerDatabase.create(
    {
      spaceInfo: spaceInfo,
      updateVolumeId: (volumeId: string) => {
        spaceInfo.sync = {
          ...(spaceInfo.sync ?? {}),
          enabled: spaceInfo.sync?.enabled ?? false,
          remote: spaceInfo.sync?.remote ?? "",
          volumeId: volumeId,
        }
        getSpaceRegistry().updateSpace(spaceId, spaceInfo)
      },
      options: {
        timeout: 3000,
      },
    },
    {
      simple: {
        libPath,
        dictPath,
      },
      graft: {
        libPath: graftLibPath,
        enabled: enableSync,
        remote: syncOptions?.remote ?? "",
        credentials,
        volumeId: syncOptions?.volumeId ?? "",
      },
      vec: {
        libPath: vecLibPath,
      },
      spacePath: getSpacePath(spaceId),
      logger: console,
    }
  )
}

export function getSpaceInfo(spaceId: string): SpaceInfo {
  const spaceInfo = getSpaceRegistry().getSpace(spaceId)
  if (!spaceInfo) {
    throw new Error(`Space not found: ${spaceId}`)
  }
  return spaceInfo
}
