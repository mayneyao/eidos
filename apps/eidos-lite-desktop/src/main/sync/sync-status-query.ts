import type {
  EidosSyncStatus,
  EidosSyncStatusPreview,
} from "../../shared/contracts"

interface SyncStatusReader {
  currentConnection(serverId?: string): Promise<EidosSyncStatus>
  status(remoteUrl: null, serverId?: string): Promise<EidosSyncStatus>
  projectPreview(status: EidosSyncStatus): Promise<EidosSyncStatus>
}

function statusPreview(value: object): EidosSyncStatusPreview {
  if (Array.isArray(value)) throw new Error("Invalid Sync status preview")
  const keys = Object.keys(value)
  if (
    "provider" in value &&
    value.provider === "official" &&
    keys.length === 1 &&
    keys[0] === "provider"
  )
    return { provider: "official" }
  if (
    "provider" in value &&
    value.provider === "custom" &&
    "serverId" in value &&
    typeof value.serverId === "string" &&
    value.serverId.trim().length > 0 &&
    keys.length === 2 &&
    keys.includes("provider") &&
    keys.includes("serverId")
  )
    return { provider: "custom", serverId: value.serverId }
  throw new Error("Invalid Sync status preview")
}

/** Preview requests never enter the current Space's connection lifecycle. */
export async function readSyncStatus(
  selection: unknown,
  reader: SyncStatusReader
): Promise<EidosSyncStatus> {
  if (selection === undefined || typeof selection === "string")
    return reader.currentConnection(selection)
  if (!selection || typeof selection !== "object")
    throw new Error("Invalid Custom server")
  const preview = statusPreview(selection)
  const status =
    preview.provider === "official"
      ? await reader.status(null)
      : await reader.status(null, preview.serverId)
  return reader.projectPreview(status)
}
