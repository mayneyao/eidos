import { useEffect, useState } from "react"
import { KeyRound, Link2, ListTree } from "lucide-react"

import type { RelationDetails } from "../types"

type InspectorTab = "columns" | "indexes" | "foreign-keys"

const tabs: Array<{ id: InspectorTab; label: string }> = [
  { id: "columns", label: "Columns" },
  { id: "indexes", label: "Indexes" },
  { id: "foreign-keys", label: "Foreign keys" },
]

export function SchemaInspector({ details }: { details: RelationDetails }) {
  const [tab, setTab] = useState<InspectorTab>("columns")
  useEffect(() => setTab("columns"), [details.relation.name])

  return (
    <aside className="schema-inspector" aria-label="Object metadata">
      <div className="inspector-tabs" role="tablist" aria-label="Metadata">
        {tabs.map((item) => (
          <button
            aria-selected={tab === item.id}
            key={item.id}
            onClick={() => setTab(item.id)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="inspector-content" role="tabpanel">
        {tab === "columns" && (
          <div className="metadata-list">
            {details.columns.map((column) => (
              <article
                className="metadata-item"
                key={`${column.cid}:${column.name}`}
              >
                <div>
                  <strong>{column.name}</strong>
                  <span>{column.declaredType || "no declared type"}</span>
                </div>
                <div className="metadata-tags">
                  {column.primaryKeyOrder > 0 && (
                    <span>
                      <KeyRound size={10} />
                      PK {column.primaryKeyOrder}
                    </span>
                  )}
                  {column.notNull && <span>not null</span>}
                  {column.hidden === 1 && <span>hidden</span>}
                  {column.hidden === 2 && <span>generated</span>}
                  {column.hidden === 3 && <span>stored</span>}
                </div>
                {column.defaultValue !== null && (
                  <code>default {column.defaultValue}</code>
                )}
              </article>
            ))}
          </div>
        )}
        {tab === "indexes" && (
          <div className="metadata-list">
            {details.indexes.map((index) => (
              <article className="metadata-item" key={index.name}>
                <div>
                  <strong>{index.name}</strong>
                  <span>
                    {index.unique ? "unique" : "non-unique"} · {index.origin}
                  </span>
                </div>
                <p>
                  {index.columns
                    .filter((column) => column.key)
                    .map((column) => column.name ?? "expression")
                    .join(", ") || "No key columns"}
                </p>
                {index.partial && (
                  <div className="metadata-tags">
                    <span>partial</span>
                  </div>
                )}
              </article>
            ))}
            {details.indexes.length === 0 && (
              <MetadataEmpty
                icon={ListTree}
                label="No indexes on this object"
              />
            )}
          </div>
        )}
        {tab === "foreign-keys" && (
          <div className="metadata-list">
            {details.foreignKeys.map((foreignKey) => (
              <article
                className="metadata-item"
                key={`${foreignKey.id}:${foreignKey.sequence}`}
              >
                <div>
                  <strong>{foreignKey.from}</strong>
                  <span>
                    references {foreignKey.table}.{foreignKey.to ?? "rowid"}
                  </span>
                </div>
                <p>
                  update {foreignKey.onUpdate.toLowerCase()} · delete{" "}
                  {foreignKey.onDelete.toLowerCase()}
                </p>
              </article>
            ))}
            {details.foreignKeys.length === 0 && (
              <MetadataEmpty
                icon={Link2}
                label="No foreign keys on this object"
              />
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

function MetadataEmpty({
  icon: Icon,
  label,
}: {
  icon: typeof Link2
  label: string
}) {
  return (
    <div className="metadata-empty">
      <Icon aria-hidden size={16} />
      <span>{label}</span>
    </div>
  )
}
