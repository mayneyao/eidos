import { useMemo, useState } from "react"
import { Eye, Search, Table2 } from "lucide-react"

import type { DatabaseSnapshot } from "../types"

interface ObjectSidebarProps {
  activeName: string | null
  onSelect(name: string): void
  snapshot: DatabaseSnapshot
}

export function ObjectSidebar({
  activeName,
  onSelect,
  snapshot,
}: ObjectSidebarProps) {
  const [query, setQuery] = useState("")
  const relations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return normalized
      ? snapshot.relations.filter((relation) =>
          relation.name.toLocaleLowerCase().includes(normalized)
        )
      : snapshot.relations
  }, [query, snapshot.relations])

  return (
    <aside className="object-sidebar" aria-label="Database objects">
      <div className="panel-heading">
        <span>Objects</span>
        <small>{snapshot.relations.length}</small>
      </div>
      <label className="object-search">
        <Search aria-hidden size={13} />
        <span className="visually-hidden">Filter database objects</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter tables and views"
        />
      </label>
      <div className="object-list">
        {relations.map((relation) => {
          const Icon = relation.kind === "view" ? Eye : Table2
          return (
            <button
              aria-current={activeName === relation.name ? "page" : undefined}
              className="object-row"
              data-kind={relation.kind}
              key={`${relation.kind}:${relation.name}`}
              onClick={() => onSelect(relation.name)}
              type="button"
            >
              <Icon aria-hidden size={14} />
              <span>{relation.name}</span>
              <small>{relation.kind}</small>
            </button>
          )
        })}
        {relations.length === 0 && (
          <p className="object-list-empty">
            {snapshot.relations.length === 0
              ? "No user tables or views"
              : "No matching objects"}
          </p>
        )}
      </div>
      <div className="sidebar-summary">
        <span>{snapshot.overview.tableCount} tables</span>
        <span>{snapshot.overview.viewCount} views</span>
      </div>
    </aside>
  )
}
