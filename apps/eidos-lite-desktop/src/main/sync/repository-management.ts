import type {
  EidosSyncRepositoryManagement,
  EidosSyncRepositoryStatus,
} from "../../shared/contracts"

export function managementCapabilities(
  value: unknown,
  origin: string
): EidosSyncRepositoryManagement {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("repositories" in value) ||
    value.repositories !== `${origin}/api/graft/repositories` ||
    !("capabilities" in value) ||
    !Array.isArray(value.capabilities)
  )
    return { rename: false, delete: false }
  return {
    rename: value.capabilities.includes("rename"),
    delete: value.capabilities.includes("delete"),
  }
}

export function repositoryStatus(value: unknown): EidosSyncRepositoryStatus {
  if (value === undefined) return "active"
  if (value === "active" || value === "deleting" || value === "deleted")
    return value
  throw new Error("Invalid remote repository status")
}
