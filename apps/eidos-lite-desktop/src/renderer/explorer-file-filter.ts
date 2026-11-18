import {
  hasExplorerFileSystemFilter,
  hasExplorerPropertyFilter,
  type ExplorerFileFilter,
} from "../shared/explorer-file-filter"

export * from "../shared/explorer-file-filter"

export function hasExplorerHostFilter(filter: ExplorerFileFilter): boolean {
  return (
    hasExplorerPropertyFilter(filter) || hasExplorerFileSystemFilter(filter)
  )
}
