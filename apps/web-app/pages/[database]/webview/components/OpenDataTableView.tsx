import type { OpenDataAdapter } from "./types"

interface OpenDataTableViewProps {
  adapter: OpenDataAdapter
  space: string
  url: string
}

export function OpenDataTableView({
  adapter,
  space,
  url,
}: OpenDataTableViewProps) {
  return <div>WIP</div>
}
