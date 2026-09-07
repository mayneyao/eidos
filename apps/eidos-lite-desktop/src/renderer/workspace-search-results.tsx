import { useId, useState } from "react"
import { ChevronRight, FileText } from "lucide-react"
import type { TextSearchHit } from "../shared/text-search"
import { SearchHighlight } from "./search-highlight"

function FileMatches({
  path,
  hits,
  opening,
  selected,
  onOpen,
}: {
  path: string
  hits: TextSearchHit[]
  opening: boolean
  selected: string | null
  onOpen(hit: TextSearchHit): void
}) {
  const [expanded, setExpanded] = useState(true)
  const id = useId()
  const slash = path.lastIndexOf("/")
  return (
    <li className="workspace-search-file">
      <button
        type="button"
        className="workspace-search-file-heading"
        title={path}
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((value) => !value)}
      >
        <ChevronRight
          size={14}
          className="workspace-search-chevron"
          aria-hidden="true"
        />
        <FileText size={14} aria-hidden="true" />
        <strong>{path.slice(slash + 1)}</strong>
        {slash >= 0 ? (
          <span className="workspace-search-directory">
            {path.slice(0, slash)}
          </span>
        ) : null}
        <span className="workspace-search-count">{hits.length}</span>
      </button>
      <ol id={id} className="workspace-search-file-matches" hidden={!expanded}>
        {hits.map((hit) => (
          <li key={hit.start}>
            <button
              type="button"
              className="workspace-search-match"
              disabled={opening}
              aria-current={
                selected === `${path}:${hit.start}` ? "true" : undefined
              }
              title={`${path}:${hit.line}:${hit.column}\n${hit.snippet}`}
              onClick={() => onOpen(hit)}
            >
              <span className="workspace-search-line">{hit.line}</span>
              <span className="workspace-search-snippet">
                <SearchHighlight text={hit.snippet} query={hit.query} />
              </span>
            </button>
          </li>
        ))}
      </ol>
    </li>
  )
}

export function WorkspaceSearchResults({
  hits,
  query,
  opening,
  onOpen,
}: {
  hits: TextSearchHit[]
  query: string
  opening: boolean
  onOpen(hit: TextSearchHit): Promise<void>
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const files = new Map<string, TextSearchHit[]>()
  for (const hit of hits) {
    const group = files.get(hit.relativePath)
    if (group) group.push(hit)
    else files.set(hit.relativePath, [hit])
  }
  return (
    <ol className="workspace-search-results">
      {Array.from(files, ([path, matches]) => (
        <FileMatches
          key={`${query}:${path}`}
          path={path}
          hits={matches}
          opening={opening}
          selected={selected}
          onOpen={(hit) => {
            setSelected(`${path}:${hit.start}`)
            void onOpen(hit)
          }}
        />
      ))}
    </ol>
  )
}
